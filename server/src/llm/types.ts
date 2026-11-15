export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompleteOptions = {
  /** Pede resposta em JSON ao provedor (quando ele aceita). */
  json?: boolean;
  maxTokens?: number;
  /** Sobrescreve o modelo padrão (ex.: modelo da avaliadora). */
  model?: string;
  /** Quanto o modelo raciocina antes de responder (ex.: "low"). Vazio: padrão do provedor. */
  reasoningEffort?: string;
};

/** Toda chamada à LLM passa por esta interface. */
export interface LlmProvider {
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<string>;
}

export class LlmError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "LlmError";
  }
}
