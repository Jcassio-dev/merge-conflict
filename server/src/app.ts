import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { CENARIOS, MARCA_FIM, cenarioPublico, lerPrompt } from "./scenarios.js";
import { Store } from "./sessions.js";
import { gerarRelatorioVotado } from "./report.js";
import { Sala } from "./sala.js";
import { Acesso, COOKIE, lerCookie, type OpcoesAcesso } from "./acesso.js";
import { Pesquisa, type OpcoesPesquisa } from "./pesquisa.js";
import { LlmError, type ChatMessage, type LlmProvider } from "./llm/types.js";
import type { VozProvider } from "./voz/types.js";

export type AppOptions = {
  llm: LlmProvider;
  /** Voz da personagem (opcional). Sem ela, a conversa é só em texto. */
  voz?: VozProvider;
  panelOrigin?: string;
  modeloAvaliadora?: string;
  /** reasoning_effort enviado nas falas da personagem e no relatório (vazio: padrão do provedor). */
  reasoningEffortPersonagem?: string;
  reasoningEffortAvaliadora?: string;
  logger?: boolean;
  /** Teto de conversas novas por hora, somando todos os jogadores (0 = sem teto). Protege o gasto com a LLM. */
  limiteSessoesPorHora?: number;
  /** Teto de conversas novas por hora para um mesmo jogadorId (0 = sem teto). Evita que uma pessoa gaste o teto da turma. */
  limiteSessoesPorJogadorHora?: number;
  /** Atrás de proxy reverso (Traefik): confia no X-Forwarded-For para registrar o IP real. */
  trustProxy?: boolean;
  /** Quantas avaliações independentes votam em cada relatório (padrão 1; produção: 3). */
  votosAvaliadora?: number;
  /** Arquivo JSON onde o progresso fica guardado (vazio = só em memória). */
  arquivoProgresso?: string;
  /** Máximo de pessoas ao mesmo tempo na sala multiplayer (padrão 50). */
  limiteSala?: number;
  acesso?: OpcoesAcesso;
  pesquisa?: OpcoesPesquisa;
};

const NovaSessao = z.object({
  jogadorId: z.string().min(1).max(100),
  cenarioId: z.string().default("cenario-1"),
});
const NovaFala = z.object({ texto: z.string().trim().min(1).max(1000) });
const ComId = z.object({ id: z.string().uuid() });
const NovoFeedback = z.object({
  util: z.number().int().min(1).max(5).optional(),
  realista: z.number().int().min(1).max(5).optional(),
  justo: z.number().int().min(1).max(5).optional(),
  comentario: z.string().trim().max(500).optional(),
  ceder: z.boolean().default(false),
});
const ComFala = z.object({ id: z.string().uuid(), n: z.coerce.number().int().min(0).max(100) });

const ERRO_LLM = "A IA não respondeu agora. Tente de novo em alguns segundos.";
const ERRO_VOZ = "A voz não carregou. A fala continua escrita na tela.";
const ERRO_LIMITE = "Muitas conversas começaram na última hora. Tente de novo mais tarde.";
const ERRO_LIMITE_JOGADOR = "Você começou muitas conversas na última hora. Descanse um pouco e tente de novo mais tarde.";
const UMA_HORA_MS = 60 * 60 * 1000;

/**
 * Gera o áudio uma vez por chave e reaproveita. Se a geração falhar, tira do cache
 * para o próximo pedido tentar de novo.
 */
function audioEmCache<K>(
  cache: Map<K, Promise<Buffer>>,
  chave: K,
  texto: string,
  voz: VozProvider,
  nomeVoz?: string,
): Promise<Buffer> {
  let audio = cache.get(chave);
  if (!audio) {
    audio = voz.sintetizar(texto, nomeVoz);
    cache.set(chave, audio);
    audio.catch(() => cache.delete(chave));
  }
  return audio;
}

const PAGINA = (titulo: string, texto: string) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo}</title>
<body style="font-family:system-ui,sans-serif;background:#f8efdc;color:#2b2118;max-width:32rem;margin:4rem auto;padding:0 16px">
<h1 style="font-size:1.4rem">${titulo}</h1><p>${texto}</p></body></html>`;

export function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: opts.trustProxy ?? false });
  const store = new Store(opts.arquivoProgresso);
  // Ao desligar (deploy, reinício), grava o que estiver pendente.
  app.addHook("onClose", async () => store.salvar());
  const limite = opts.limiteSessoesPorHora ?? 0;
  const inicios: number[] = []; // horários (ms) das sessões criadas na última hora
  const limiteJogador = opts.limiteSessoesPorJogadorHora ?? 0;
  const iniciosPorJogador = new Map<string, number[]>();
  // Áudio da abertura de cada cenário: o texto é fixo, então é gerado uma vez para todos.
  const audiosAbertura = new Map<string, Promise<Buffer>>();
  // Uma ou mais origens separadas por vírgula (ex.: painel e mapa em portas diferentes no local).
  const origens = (opts.panelOrigin ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  app.register(cors, { origin: origens.length ? origens : true });

  app.get("/health", async () => ({ ok: true }));

  const acesso = new Acesso(opts.acesso ?? {});
  const acessoAberto = !opts.acesso?.codigo && !opts.acesso?.usuario;
  if (acessoAberto) app.log.warn("sem CONVITE_CODIGO nem SITE_USUARIO: /api/acesso deixa todo mundo entrar");

  app.get("/api/entrar", async (req, reply) => {
    const { c } = req.query as { c?: string };
    if (!acesso.linkValido(typeof c === "string" ? c : undefined)) {
      req.log.warn("link de convite inválido ou vencido");
      return reply
        .code(403)
        .type("text/html; charset=utf-8")
        .send(PAGINA("Este link não vale mais", "Ele está errado ou venceu. Peça o link novo para a equipe do projeto."));
    }
    const { valor, maxAge } = acesso.novoCookie();
    return reply
      .header("set-cookie", `${COOKIE}=${valor}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`)
      .redirect("/", 302);
  });

  // forward_auth do Caddy: 204 deixa passar; 401 com Basic faz o navegador pedir a senha antiga.
  app.get("/api/acesso", async (req, reply) => {
    if (acessoAberto) return reply.code(204).send();
    if (acesso.cookieValido(lerCookie(req.headers.cookie, COOKIE)) || acesso.basicValido(req.headers.authorization)) {
      return reply.code(204).send();
    }
    if (opts.acesso?.usuario) reply.header("www-authenticate", 'Basic realm="Conversas Dificeis em TI", charset="UTF-8"');
    return reply
      .code(401)
      .type("text/html; charset=utf-8")
      .send(PAGINA("Entre pelo link de convite", "Abra o link que a equipe mandou para a turma."));
  });

  const pesquisa = new Pesquisa(opts.pesquisa ?? {});

  // Cenários do piloto, em ordem (só o que o painel mostra; os prompts ficam aqui).
  app.get("/api/cenarios", async () => ({
    cenarios: Object.values(CENARIOS).sort((a, b) => a.ordem - b.ordem).map(cenarioPublico),
  }));

  // Sala multiplayer do escritório (WebSocket): posição e apelido de quem está jogando.
  const sala = new Sala(opts.limiteSala ?? 50);
  app.register(websocket, { options: { maxPayload: 512 } });
  app.register(async (f) => {
    f.get("/api/sala", { websocket: true }, (socket) => {
      const conexao = {
        enviar: (msg: object) => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
        },
      };
      if (!sala.conectar(conexao)) {
        socket.close(1013, "Sala cheia");
        return;
      }
      socket.on("message", (dado) => sala.receber(conexao, String(dado)));
      socket.on("close", () => sala.desconectar(conexao));
      socket.on("error", () => sala.desconectar(conexao));
    });
  });

  // Começa uma tentativa do cenário. Devolve a fala de abertura (fixa).
  app.post("/api/sessoes", async (req, reply) => {
    const body = NovaSessao.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ erro: "Dados inválidos" });
    const cenario = CENARIOS[body.data.cenarioId];
    if (!cenario) return reply.code(404).send({ erro: "Cenário não encontrado" });
    const agora = Date.now();
    const recentes = (lista: number[]) => {
      while (lista.length && agora - lista[0]! > UMA_HORA_MS) lista.shift();
      return lista;
    };
    // O jogadorId vem do navegador: segura o abuso pelo jogo, não quem forja pedidos.
    // Limite por IP não serve: no piloto a turma sai toda pelo mesmo IP.
    const doJogador = limiteJogador > 0 ? recentes(iniciosPorJogador.get(body.data.jogadorId) ?? []) : [];
    if (limiteJogador > 0 && doJogador.length >= limiteJogador) {
      req.log.warn({ limiteJogador }, "teto de sessões por jogador atingido");
      return reply.code(429).send({ erro: ERRO_LIMITE_JOGADOR });
    }
    if (limite > 0) {
      if (recentes(inicios).length >= limite) {
        req.log.warn({ limite }, "teto de sessões por hora atingido");
        return reply.code(429).send({ erro: ERRO_LIMITE });
      }
      inicios.push(agora);
    }
    if (limiteJogador > 0) {
      doJogador.push(agora);
      iniciosPorJogador.set(body.data.jogadorId, doJogador);
      // Não deixa o mapa crescer sem fim com jogadores que não voltaram.
      if (iniciosPorJogador.size > 5000) {
        for (const [id, lista] of iniciosPorJogador) if (!recentes(lista).length) iniciosPorJogador.delete(id);
      }
    }
    const s = store.criar(body.data.jogadorId, cenario.id, cenario.abertura);
    return reply
      .code(201)
      .send({ sessaoId: s.id, abertura: cenario.abertura, maxTrocas: cenario.maxTrocas, voz: Boolean(opts.voz) });
  });

  // Uma fala do jogador → resposta da personagem.
  app.post("/api/sessoes/:id/falas", async (req, reply) => {
    const params = ComId.safeParse(req.params);
    const body = NovaFala.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ erro: "Dados inválidos" });
    const s = store.obter(params.data.id);
    if (!s) return reply.code(404).send({ erro: "Sessão não encontrada ou expirada" });
    if (s.encerrada) return reply.code(409).send({ erro: "A conversa já terminou" });
    const cenario = CENARIOS[s.cenarioId]!;

    const mensagens: ChatMessage[] = [
      { role: "system", content: lerPrompt(cenario.promptPersonagem) },
      ...s.falas.map((f): ChatMessage => ({ role: f.autor === "jogador" ? "user" : "assistant", content: f.texto })),
      { role: "user", content: body.data.texto },
    ];

    let resposta: string;
    try {
      resposta = await opts.llm.complete(mensagens, {
        // O limite inclui o raciocínio do modelo (Gemini 3): com 200, uma fala agressiva
        // fazia o modelo pensar mais e a resposta saía cortada. O prompt já pede falas curtas.
        maxTokens: 1024,
        reasoningEffort: opts.reasoningEffortPersonagem,
      });
    } catch (err) {
      req.log.warn({ err: err instanceof Error ? err.message : err }, "falha na LLM (personagem)");
      return reply.code(502).send({ erro: ERRO_LLM });
    }

    let encerrada = resposta.includes(MARCA_FIM);
    resposta = resposta.replaceAll(MARCA_FIM, "").trim();
    s.falas.push({ autor: "jogador", texto: body.data.texto }, { autor: "personagem", texto: resposta });
    const troca = s.falas.filter((f) => f.autor === "jogador").length;
    if (troca >= cenario.maxTrocas) encerrada = true;
    s.encerrada = encerrada;
    return { resposta, troca, maxTrocas: cenario.maxTrocas, encerrada };
  });

  // Áudio de uma fala da personagem. Só gera voz do que a personagem disse nesta sessão,
  // para a API não virar um gerador de voz para qualquer texto.
  app.get("/api/sessoes/:id/falas/:n/voz", async (req, reply) => {
    const params = ComFala.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ erro: "Dados inválidos" });
    if (!opts.voz) return reply.code(404).send({ erro: "Voz desligada" });
    const s = store.obter(params.data.id);
    const fala = s?.falas[params.data.n];
    if (!s || fala?.autor !== "personagem") return reply.code(404).send({ erro: "Fala não encontrada" });

    // A fala 0 é a abertura fixa do cenário (um áudio para todos); as outras são desta sessão.
    const nomeVoz = CENARIOS[s.cenarioId]?.personagem.voz;
    const audio =
      params.data.n === 0
        ? audioEmCache(audiosAbertura, s.cenarioId, fala.texto, opts.voz, nomeVoz)
        : audioEmCache((s.audios ??= new Map()), params.data.n, fala.texto, opts.voz, nomeVoz);
    try {
      const wav = await audio;
      return reply.header("content-type", "audio/wav").header("cache-control", "private, max-age=3600").send(wav);
    } catch (err) {
      req.log.warn({ err: err instanceof Error ? err.message : err }, "falha na voz");
      return reply.code(502).send({ erro: ERRO_VOZ });
    }
  });

  // Gera (uma vez) o relatório da conversa e registra o progresso.
  app.post("/api/sessoes/:id/relatorio", async (req, reply) => {
    const params = ComId.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ erro: "Dados inválidos" });
    const s = store.obter(params.data.id);
    if (!s) return reply.code(404).send({ erro: "Sessão não encontrada ou expirada" });
    if (!s.falas.some((f) => f.autor === "jogador")) {
      return reply.code(409).send({ erro: "Converse com a personagem antes de pedir o relatório" });
    }
    if (!s.relatorio) {
      try {
        const { relatorio, divergentes } = await gerarRelatorioVotado(opts.llm, s.falas, opts.votosAvaliadora ?? 1, {
          cenario: CENARIOS[s.cenarioId],
          model: opts.modeloAvaliadora,
          reasoningEffort: opts.reasoningEffortAvaliadora,
        });
        s.relatorio = relatorio;
        // Avaliadoras discordaram totalmente: anota para a equipe revisar a rubrica (sem a conversa).
        if (divergentes.length) req.log.warn({ cenario: s.cenarioId, divergentes }, "avaliação divergente");
        await pesquisa.conversaConcluida(s, { votos: opts.votosAvaliadora ?? 1, divergentes });
      } catch (err) {
        req.log.warn({ err: err instanceof Error ? err.message : err }, "falha na LLM (avaliadora)");
        return reply.code(502).send({ erro: ERRO_LLM });
      }
      s.encerrada = true;
      store.registrarConclusao(s, Object.fromEntries(s.relatorio.criterios.map((c) => [c.nome, c.nivel])));
    }
    return { relatorio: s.relatorio, falas: s.falas };
  });

  app.post("/api/sessoes/:id/feedback", async (req, reply) => {
    const params = ComId.safeParse(req.params);
    const body = NovoFeedback.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ erro: "Dados inválidos" });
    const s = store.obter(params.data.id);
    if (!s) return reply.code(404).send({ erro: "Esta conversa expirou. Obrigado mesmo assim!" });
    if (!s.relatorio) return reply.code(409).send({ erro: "Termine a conversa antes de responder" });
    if (s.feedbackEnviado) return reply.code(409).send({ erro: "Você já respondeu sobre esta conversa" });
    s.feedbackEnviado = true;
    await pesquisa.feedback(s, { ...body.data, comentario: body.data.comentario || undefined });
    return reply.code(201).send({ ok: true });
  });

  // Progresso por cenário (sem pontuação nem ranking).
  app.get("/api/progresso/:jogadorId", async (req) => {
    const { jogadorId } = req.params as { jogadorId: string };
    return { progresso: store.progressoDe(jogadorId.slice(0, 100)) };
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    const status = err instanceof LlmError ? 502 : (err as { statusCode?: number }).statusCode ?? 500;
    const erro = status === 502 ? ERRO_LLM : status < 500 ? "Requisição inválida" : "Erro inesperado";
    reply.code(status).send({ erro });
  });

  return app;
}
