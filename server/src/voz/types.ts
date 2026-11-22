/** Toda síntese de voz (fala da personagem → áudio) passa por esta interface. */
export interface VozProvider {
  /** Devolve o áudio em WAV. `voz` troca a voz padrão (cada personagem tem a sua). */
  sintetizar(texto: string, voz?: string): Promise<Buffer>;
}

export class VozError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "VozError";
  }
}
