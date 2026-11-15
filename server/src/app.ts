import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { CENARIOS, MARCA_FIM, lerPrompt } from "./scenarios.js";
import { Store } from "./sessions.js";
import { gerarRelatorio } from "./report.js";
import { LlmError, type ChatMessage, type LlmProvider } from "./llm/types.js";

export type AppOptions = {
  llm: LlmProvider;
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

const ERRO_LLM = "A IA não respondeu agora. Tente de novo em alguns segundos.";
const ERRO_LIMITE = "Muitas conversas começaram na última hora. Tente de novo mais tarde.";
const UMA_HORA_MS = 60 * 60 * 1000;

export function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: opts.trustProxy ?? false });
  const store = new Store();
  const limite = opts.limiteSessoesPorHora ?? 0;
  const inicios: number[] = []; // horários (ms) das sessões criadas na última hora
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
    return reply.code(201).send({ sessaoId: s.id, abertura: cenario.abertura, maxTrocas: cenario.maxTrocas });
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
        maxTokens: 200,
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
