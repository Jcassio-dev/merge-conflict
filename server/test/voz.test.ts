import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { MockProvider } from "../src/llm/mock.js";
import { GeminiTtsProvider } from "../src/voz/gemini.js";
import { VozError, type VozProvider } from "../src/voz/types.js";

const WAV_FALSO = Buffer.from("RIFF....WAVEfmt fake");

function vozFalsa(): VozProvider & { textos: string[] } {
  const textos: string[] = [];
  return {
    textos,
    async sintetizar(texto: string) {
      textos.push(texto);
      return WAV_FALSO;
    },
  };
}

async function iniciar(voz?: VozProvider) {
  const app = buildApp({ llm: new MockProvider(), voz });
  const res = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j1" } });
  return { app, sessaoId: res.json().sessaoId as string, inicio: res.json() };
}

describe("voz da Marina", () => {
  it("avisa que a voz está desligada quando não há provedor de voz", async () => {
    const { app, sessaoId, inicio } = await iniciar();
    expect(inicio.voz).toBe(false);
    const r = await app.inject({ method: "GET", url: `/api/sessoes/${sessaoId}/falas/0/voz` });
    expect(r.statusCode).toBe(404);
  });

  it("devolve o áudio WAV de uma fala da Marina e guarda para não gerar de novo", async () => {
    const voz = vozFalsa();
    const { app, sessaoId, inicio } = await iniciar(voz);
    expect(inicio.voz).toBe(true);
    const r1 = await app.inject({ method: "GET", url: `/api/sessoes/${sessaoId}/falas/0/voz` });
    expect(r1.statusCode).toBe(200);
    expect(r1.headers["content-type"]).toBe("audio/wav");
    expect(r1.rawPayload.equals(WAV_FALSO)).toBe(true);
    const r2 = await app.inject({ method: "GET", url: `/api/sessoes/${sessaoId}/falas/0/voz` });
    expect(r2.statusCode).toBe(200);
    expect(voz.textos).toEqual([inicio.abertura]);
  });

  it("gera o áudio da abertura (fixa) uma vez só para todas as sessões", async () => {
    const voz = vozFalsa();
    const app = buildApp({ llm: new MockProvider(), voz });
    for (const jogadorId of ["j1", "j2"]) {
      const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId } });
      const r = await app.inject({ method: "GET", url: `/api/sessoes/${s.json().sessaoId}/falas/0/voz` });
      expect(r.statusCode).toBe(200);
    }
    expect(voz.textos).toHaveLength(1);
  });

  it("só fala o que a Marina disse: recusa falas do jogador e índices inexistentes", async () => {
    const voz = vozFalsa();
    const { app, sessaoId } = await iniciar(voz);
    await app.inject({ method: "POST", url: `/api/sessoes/${sessaoId}/falas`, payload: { texto: "Hum, deixa eu pensar." } });
    const doJogador = await app.inject({ method: "GET", url: `/api/sessoes/${sessaoId}/falas/1/voz` });
    expect(doJogador.statusCode).toBe(404);
    const resposta = await app.inject({ method: "GET", url: `/api/sessoes/${sessaoId}/falas/2/voz` });
    expect(resposta.statusCode).toBe(200);
    for (const n of ["3", "-1", "abc", "99999999999"]) {
      const r = await app.inject({ method: "GET", url: `/api/sessoes/${sessaoId}/falas/${n}/voz` });
      expect([400, 404]).toContain(r.statusCode);
    }
    expect(voz.textos).toHaveLength(1);
  });

  it("responde 502 quando o provedor de voz falha, e tenta de novo na próxima vez", async () => {
    let falhar = true;
    const voz: VozProvider = {
      async sintetizar() {
        if (falhar) throw new VozError("fora do ar");
        return WAV_FALSO;
      },
    };
    const { app, sessaoId } = await iniciar(voz);
    const r1 = await app.inject({ method: "GET", url: `/api/sessoes/${sessaoId}/falas/0/voz` });
    expect(r1.statusCode).toBe(502);
    falhar = false;
    const r2 = await app.inject({ method: "GET", url: `/api/sessoes/${sessaoId}/falas/0/voz` });
    expect(r2.statusCode).toBe(200);
  });
});

describe("GeminiTtsProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  const resposta = (mimeType: string, dados: Buffer) =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data: dados.toString("base64") } }] } }] }),
      { status: 200 },
    );

  it("pede áudio com a voz configurada, sem pôr a chave na URL", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init: RequestInit) => resposta("audio/wav", WAV_FALSO));
    vi.stubGlobal("fetch", fetchFalso);
    const tts = new GeminiTtsProvider({ apiKey: "chave-secreta", model: "tts-x", voz: "Kore", timeoutMs: 1000 });
    const wav = await tts.sintetizar("Oi!");
    expect(wav.equals(WAV_FALSO)).toBe(true);
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/tts-x:generateContent");
    expect(url).not.toContain("chave-secreta");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("chave-secreta");
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore");
    expect(JSON.stringify(body.contents)).toContain("Oi!");
  });

  it("embrulha PCM cru (audio/L16) num WAV de 24 kHz", async () => {
    const pcm = Buffer.alloc(480);
    vi.stubGlobal("fetch", vi.fn(async () => resposta("audio/L16;codec=pcm;rate=24000", pcm)));
    const tts = new GeminiTtsProvider({ apiKey: "k", model: "m", voz: "Kore", timeoutMs: 1000 });
    const wav = await tts.sintetizar("Oi!");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.length).toBe(44 + pcm.length);
  });

  it("repete uma vez em 503 e lança VozError se continuar falhando", async () => {
    const fetchFalso = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchFalso);
    const tts = new GeminiTtsProvider({ apiKey: "k", model: "m", voz: "Kore", timeoutMs: 1000, retryDelayMs: 1 });
    await expect(tts.sintetizar("Oi!")).rejects.toBeInstanceOf(VozError);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });
});
