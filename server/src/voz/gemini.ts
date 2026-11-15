import { VozError, type VozProvider } from "./types.js";

type Config = {
  apiKey: string;
  /** Ex.: gemini-3.8-flash-lite-tts */
  model: string;
  /** Voz pronta do Gemini (ex.: Kore). */
  voz: string;
  timeoutMs: number;
  baseUrl?: string;
  /** Espera antes de repetir uma chamada que falhou com 429/5xx (padrão 500 ms). */
  retryDelayMs?: number;
};

const BASE_PADRAO = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Voz da personagem pelo Gemini TTS (API nativa: o formato OpenAI do Gemini não tem voz).
 * A chave vai no cabeçalho, nunca na URL (URLs aparecem em log).
 */
export class GeminiTtsProvider implements VozProvider {
  constructor(private readonly cfg: Config) {
    if (!cfg.apiKey || !cfg.model || !cfg.voz) {
      throw new Error("Chave, modelo e voz são obrigatórios para a voz do Gemini.");
    }
  }

  async sintetizar(texto: string): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    // Só o texto da fala: instruções de tom junto com o texto acabam sendo lidas em voz alta.
    const body = {
      contents: [{ parts: [{ text: texto }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.cfg.voz } } },
      },
    };
    const url = `${(this.cfg.baseUrl ?? BASE_PADRAO).replace(/\/$/, "")}/models/${this.cfg.model}:generateContent`;
    try {
      const chamar = () =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.cfg.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      let res = await chamar();
      if (res.status === 429 || res.status >= 500) {
        await res.body?.cancel();
        await new Promise((r) => setTimeout(r, this.cfg.retryDelayMs ?? 500));
        res = await chamar();
      }
      if (!res.ok) throw new VozError(`Provedor de voz respondeu ${res.status}`);
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
      };
      const audio = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!audio?.data) throw new VozError("Resposta sem áudio");
      const bytes = Buffer.from(audio.data, "base64");
      const mime = audio.mimeType ?? "";
      if (mime.startsWith("audio/wav") || mime.startsWith("audio/x-wav")) return bytes;
      // PCM cru (ex.: "audio/L16;codec=pcm;rate=24000"): monta o cabeçalho WAV.
      const taxa = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
      return pcmParaWav(bytes, taxa);
    } catch (err) {
      if (err instanceof VozError) throw err;
      const motivo = controller.signal.aborted ? "Tempo esgotado" : "Falha de rede";
      throw new VozError(`${motivo} ao chamar o provedor de voz`, err);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** PCM 16 bits mono → WAV. */
export function pcmParaWav(pcm: Buffer, taxa: number): Buffer {
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0);
  cab.writeUInt32LE(36 + pcm.length, 4);
  cab.write("WAVE", 8);
  cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20); // PCM
  cab.writeUInt16LE(1, 22); // mono
  cab.writeUInt32LE(taxa, 24);
  cab.writeUInt32LE(taxa * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36);
  cab.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cab, pcm]);
}
