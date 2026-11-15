import { buildApp } from "./app.js";
import { MockProvider } from "./llm/mock.js";
import { OpenAICompatibleProvider } from "./llm/openaiCompatible.js";
import type { LlmProvider } from "./llm/types.js";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa variáveis do ambiente
}

const env = process.env;

function criarProvedor(): LlmProvider {
  if ((env.LLM_PROVIDER ?? "mock") === "mock") {
    console.warn("LLM_PROVIDER=mock: usando Marina SIMULADA (sem IA real).");
    return new MockProvider();
  }
  return new OpenAICompatibleProvider({
    baseUrl: env.LLM_BASE_URL ?? "",
    apiKey: env.LLM_API_KEY ?? "",
    model: env.LLM_MODEL ?? "",
    timeoutMs: Number(env.LLM_TIMEOUT_MS ?? 30000),
    jsonMode: (env.LLM_JSON_MODE ?? "true") === "true",
  });
}

const app = buildApp({
  llm: criarProvedor(),
  panelOrigin: env.PANEL_ORIGIN,
  modeloAvaliadora: env.LLM_MODEL_AVALIADORA || undefined,
  reasoningEffortPersonagem: env.LLM_REASONING_EFFORT || undefined,
  reasoningEffortAvaliadora: env.LLM_REASONING_EFFORT_AVALIADORA || env.LLM_REASONING_EFFORT || undefined,
  logger: true,
  limiteSessoesPorHora: Number(env.LIMITE_SESSOES_POR_HORA ?? 0),
  trustProxy: env.TRUST_PROXY === "true",
});

app.listen({ port: Number(env.PORT ?? 8787), host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
