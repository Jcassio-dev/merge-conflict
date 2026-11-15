/** Toda síntese de voz (fala da personagem → áudio) passa por esta interface. */
export interface VozProvider {
  /** Devolve o áudio em WAV. */
  sintetizar(texto: string): Promise<Buffer>;
}

export class VozError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "VozError";
  }
}
