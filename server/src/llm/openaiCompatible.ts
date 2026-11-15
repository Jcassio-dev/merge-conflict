import { ChatMessage, CompleteOptions, LlmError, LlmProvider } from "./types.js";

type Config = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  jsonMode: boolean;
};

/**
 * Provedor para qualquer API no formato OpenAI /chat/completions
 * (OpenAI, Gemini e Claude oferecem esse formato).
 */
export class OpenAICompatibleProvider implements LlmProvider {
  constructor(private readonly cfg: Config) {
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
      throw new Error("LLM_BASE_URL, LLM_API_KEY e LLM_MODEL são obrigatórios para o provedor openai-compatible.");
    }
  }

  async complete(messages: ChatMessage[], opts: CompleteOptions = {}): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    const body: Record<string, unknown> = {
      model: opts.model ?? this.cfg.model,
      messages,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.json ? 0.2 : 0.7,
    };
    if (opts.json && this.cfg.jsonMode) body.response_format = { type: "json_object" };

    try {
      const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Não logar o corpo da requisição: ele contém a conversa do jogador.
        throw new LlmError(`Provedor respondeu ${res.status}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new LlmError("Resposta vazia do provedor");
      return content.trim();
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw new LlmError("Falha ao chamar o provedor de LLM", err);
    } finally {
      clearTimeout(timer);
    }
  }
}
