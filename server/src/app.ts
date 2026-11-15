import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { CENARIOS, MARCA_FIM, lerPrompt } from "./scenarios.js";
import { Store } from "./sessions.js";
import { gerarRelatorio } from "./report.js";
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
  /** Atrás de proxy reverso (Traefik): confia no X-Forwarded-For para registrar o IP real. */
  trustProxy?: boolean;
};

const NovaSessao = z.object({
  jogadorId: z.string().min(1).max(100),
  cenarioId: z.string().default("cenario-1"),
});
const NovaFala = z.object({ texto: z.string().trim().min(1).max(1000) });
const ComId = z.object({ id: z.string().uuid() });
const ComFala = z.object({ id: z.string().uuid(), n: z.coerce.number().int().min(0).max(100) });

const ERRO_LLM = "A IA não respondeu agora. Tente de novo em alguns segundos.";
const ERRO_VOZ = "A voz não carregou. A fala continua escrita na tela.";
const ERRO_LIMITE = "Muitas conversas começaram na última hora. Tente de novo mais tarde.";
const UMA_HORA_MS = 60 * 60 * 1000;

/**
 * Gera o áudio uma vez por chave e reaproveita. Se a geração falhar, tira do cache
 * para o próximo pedido tentar de novo.
 */
function audioEmCache<K>(cache: Map<K, Promise<Buffer>>, chave: K, texto: string, voz: VozProvider): Promise<Buffer> {
  let audio = cache.get(chave);
  if (!audio) {
    audio = voz.sintetizar(texto);
    cache.set(chave, audio);
    audio.catch(() => cache.delete(chave));
  }
  return audio;
}

export function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: opts.trustProxy ?? false });
  const store = new Store();
  const limite = opts.limiteSessoesPorHora ?? 0;
  const inicios: number[] = []; // horários (ms) das sessões criadas na última hora
  // Áudio da abertura de cada cenário: o texto é fixo, então é gerado uma vez para todos.
  const audiosAbertura = new Map<string, Promise<Buffer>>();
  // Uma ou mais origens separadas por vírgula (ex.: painel e mapa em portas diferentes no local).
  const origens = (opts.panelOrigin ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  app.register(cors, { origin: origens.length ? origens : true });

  app.get("/health", async () => ({ ok: true }));

  // Começa uma tentativa do cenário. Devolve a fala de abertura (fixa).
  app.post("/api/sessoes", async (req, reply) => {
    const body = NovaSessao.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ erro: "Dados inválidos" });
    const cenario = CENARIOS[body.data.cenarioId];
    if (!cenario) return reply.code(404).send({ erro: "Cenário não encontrado" });
    if (limite > 0) {
      const agora = Date.now();
      while (inicios.length && agora - inicios[0]! > UMA_HORA_MS) inicios.shift();
      if (inicios.length >= limite) {
        req.log.warn({ limite }, "teto de sessões por hora atingido");
        return reply.code(429).send({ erro: ERRO_LIMITE });
      }
      inicios.push(agora);
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
    const audio =
      params.data.n === 0
        ? audioEmCache(audiosAbertura, s.cenarioId, fala.texto, opts.voz)
        : audioEmCache((s.audios ??= new Map()), params.data.n, fala.texto, opts.voz);
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
        s.relatorio = await gerarRelatorio(opts.llm, s.falas, {
          model: opts.modeloAvaliadora,
          reasoningEffort: opts.reasoningEffortAvaliadora,
        });
      } catch (err) {
        req.log.warn({ err: err instanceof Error ? err.message : err }, "falha na LLM (avaliadora)");
        return reply.code(502).send({ erro: ERRO_LLM });
      }
      s.encerrada = true;
      store.registrarConclusao(s, Object.fromEntries(s.relatorio.criterios.map((c) => [c.nome, c.nivel])));
    }
    return { relatorio: s.relatorio, falas: s.falas };
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
