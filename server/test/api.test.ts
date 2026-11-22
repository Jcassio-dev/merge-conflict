import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { MockProvider } from "../src/llm/mock.js";
import { OpenAICompatibleProvider } from "../src/llm/openaiCompatible.js";
import { LlmError, type ChatMessage, type CompleteOptions, type LlmProvider } from "../src/llm/types.js";

async function iniciar(llm: LlmProvider = new MockProvider()) {
  const app = buildApp({ llm });
  const res = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j1" } });
  return { app, sessaoId: res.json().sessaoId as string, inicio: res.json() };
}

const falar = (app: ReturnType<typeof buildApp>, id: string, texto: string) =>
  app.inject({ method: "POST", url: `/api/sessoes/${id}/falas`, payload: { texto } });

describe("conversa do Cenário 1", () => {
  it("começa com a fala de abertura fixa", async () => {
    const { inicio } = await iniciar();
    expect(inicio.abertura).toContain("login com Google");
    expect(inicio.maxTrocas).toBe(8);
  });

  it("fato + impacto + proposta leva a acordo e relatório com citações reais", async () => {
    const { app, sessaoId } = await iniciar();
    const r1 = await falar(app, sessaoId, "Entendo a pressão. Com o login, a demo de sexta atrasa. Posso entregar na próxima sprint?");
    expect(r1.json().encerrada).toBe(true);
    expect(r1.json().resposta).not.toContain("[FIM]");

    const rel = await app.inject({ method: "POST", url: `/api/sessoes/${sessaoId}/relatorio` });
    expect(rel.statusCode).toBe(200);
    expect(rel.json().relatorio.resultado).toBe("acordo");
    expect(rel.json().relatorio.criterios).toHaveLength(4);

    const prog = await app.inject({ method: "GET", url: "/api/progresso/j1" });
    expect(prog.json().progresso["cenario-1"]).toMatchObject({ concluido: true, tentativas: 1 });
  });

  it("recusa ríspida não encerra; a personagem insiste", async () => {
    const { app, sessaoId } = await iniciar();
    const r = await falar(app, sessaoId, "Não dá. Isso é impossível.");
    expect(r.json().encerrada).toBe(false);
    expect(r.json().resposta).toContain("prometi");
  });

  it("encerra ao atingir o limite de 8 falas e recusa a 9ª", async () => {
    const { app, sessaoId } = await iniciar();
    let ultima;
    for (let i = 0; i < 8; i++) ultima = await falar(app, sessaoId, "Hum, deixa eu pensar.");
    expect(ultima!.json()).toMatchObject({ troca: 8, encerrada: true });
    expect((await falar(app, sessaoId, "Mais uma")).statusCode).toBe(409);
  });

  it("valida entrada e sessão inexistente", async () => {
    const { app, sessaoId } = await iniciar();
    expect((await falar(app, sessaoId, "   ")).statusCode).toBe(400);
    expect((await falar(app, "00000000-0000-4000-8000-000000000000", "oi")).statusCode).toBe(404);
  });

  it("aceita pedido de relatório com corpo JSON vazio ({})", async () => {
    const { app, sessaoId } = await iniciar();
    await falar(app, sessaoId, "Com isso a demo atrasa. Podemos deixar para a próxima sprint?");
    const rel = await app.inject({
      method: "POST", url: `/api/sessoes/${sessaoId}/relatorio`,
      headers: { "content-type": "application/json" }, payload: "{}",
    });
    expect(rel.statusCode).toBe(200);
  });

  it("falha da LLM devolve 502 com mensagem amigável", async () => {
    const quebrada: LlmProvider = { complete: async () => { throw new Error("timeout"); } };
    const { app, sessaoId } = await iniciar(quebrada);
    const r = await falar(app, sessaoId, "oi");
    expect(r.statusCode).toBe(502);
    expect(r.json().erro).toContain("Tente de novo");
  });

  it("rejeita relatório com citação inventada e tenta de novo", async () => {
    let chamadas = 0;
    const mock = new MockProvider();
    const llm: LlmProvider = {
      complete: async (msgs: ChatMessage[], o) => {
        if (!msgs[0]!.content.includes("AVALIADORA")) return mock.complete(msgs);
        chamadas++;
        const real = JSON.parse(await mock.complete(msgs));
        if (chamadas === 1) real.para_treinar.voce_disse = "frase que o jogador nunca disse";
        return JSON.stringify(real);
      },
    };
    const { app, sessaoId } = await iniciar(llm);
    await falar(app, sessaoId, "Tá bom, a gente dá um jeito.");
    const rel = await app.inject({ method: "POST", url: `/api/sessoes/${sessaoId}/relatorio` });
    expect(rel.statusCode).toBe(200);
    expect(chamadas).toBe(2);
    expect(rel.json().relatorio.resultado).toBe("sobrecarga_aceita");
  });

  it("teto de sessões por hora devolve 429 com mensagem clara", async () => {
    const app = buildApp({ llm: new MockProvider(), limiteSessoesPorHora: 2 });
    const nova = () => app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j1" } });
    expect((await nova()).statusCode).toBe(201);
    expect((await nova()).statusCode).toBe(201);
    const r = await nova();
    expect(r.statusCode).toBe(429);
    expect(r.json().erro).toContain("Tente de novo mais tarde");
  });
});

describe("raciocínio da LLM (reasoning_effort)", () => {
  it("personagem e avaliadora recebem modelo e esforço configurados", async () => {
    const mock = new MockProvider();
    const vistas: CompleteOptions[] = [];
    const llm: LlmProvider = {
      complete: async (msgs, o = {}) => {
        vistas.push(o);
        return mock.complete(msgs);
      },
    };
    const app = buildApp({
      llm,
      modeloAvaliadora: "modelo-avaliadora",
      reasoningEffortPersonagem: "low",
      reasoningEffortAvaliadora: "medium",
    });
    const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j1" } });
    const id = s.json().sessaoId as string;
    await falar(app, id, "Tá bom, a gente dá um jeito.");
    await app.inject({ method: "POST", url: `/api/sessoes/${id}/relatorio` });
    expect(vistas[0]).toMatchObject({ reasoningEffort: "low" });
    expect(vistas.at(-1)).toMatchObject({ json: true, model: "modelo-avaliadora", reasoningEffort: "medium" });
  });

  it("provedor só envia reasoning_effort quando configurado", async () => {
    const corpos: Record<string, unknown>[] = [];
    const fetchFalso = vi.fn(async (_url: string, init: RequestInit) => {
      corpos.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ choices: [{ message: { content: "oi" } }] }));
    });
    vi.stubGlobal("fetch", fetchFalso);
    try {
      const p = new OpenAICompatibleProvider({ baseUrl: "http://x", apiKey: "k", model: "m", timeoutMs: 1000, jsonMode: true });
      await p.complete([{ role: "user", content: "oi" }], { reasoningEffort: "low" });
      await p.complete([{ role: "user", content: "oi" }]);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(corpos[0]).toMatchObject({ reasoning_effort: "low" });
    expect(corpos[1]).not.toHaveProperty("reasoning_effort");
  });

  it("repete uma vez quando o provedor está sobrecarregado (503) e não repete erro 400", async () => {
    const respostas = [
      new Response("", { status: 503 }),
      new Response(JSON.stringify({ choices: [{ message: { content: "voltou" } }] })),
      new Response("", { status: 400 }),
    ];
    const fetchFalso = vi.fn(async () => respostas.shift()!);
    vi.stubGlobal("fetch", fetchFalso);
    try {
      const p = new OpenAICompatibleProvider({ baseUrl: "http://x", apiKey: "k", model: "m", timeoutMs: 1000, jsonMode: true, retryDelayMs: 0 });
      expect(await p.complete([{ role: "user", content: "oi" }])).toBe("voltou");
      await expect(p.complete([{ role: "user", content: "oi" }])).rejects.toThrow("400");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchFalso).toHaveBeenCalledTimes(3);
  });
});

describe("falha de rede", () => {
  it("repete uma vez quando a conexão cai e diz no erro que foi a rede", async () => {
    const fetchFalso = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "voltou" } }] })))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchFalso);
    try {
      const p = new OpenAICompatibleProvider({ baseUrl: "http://x", apiKey: "k", model: "m", timeoutMs: 1000, jsonMode: true, retryDelayMs: 0 });
      expect(await p.complete([{ role: "user", content: "oi" }])).toBe("voltou");
      await expect(p.complete([{ role: "user", content: "oi" }])).rejects.toThrow("rede");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchFalso).toHaveBeenCalledTimes(4);
  });
});

describe("resposta cortada pelo limite de tokens", () => {
  it("o provedor recusa resposta cortada (finish_reason length) em vez de devolver meia frase", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "Olha, eu sei que" } }] })),
      ),
    );
    try {
      const p = new OpenAICompatibleProvider({ baseUrl: "http://x", apiKey: "k", model: "m", timeoutMs: 1000, jsonMode: true });
      await expect(p.complete([{ role: "user", content: "oi" }])).rejects.toBeInstanceOf(LlmError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("dá folga para o raciocínio do modelo: 1024 tokens na fala e 4096 no relatório", async () => {
    const mock = new MockProvider();
    const vistas: CompleteOptions[] = [];
    const llm: LlmProvider = {
      complete: async (msgs, o = {}) => {
        vistas.push(o);
        return mock.complete(msgs);
      },
    };
    const app = buildApp({ llm });
    const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j1" } });
    const id = s.json().sessaoId as string;
    await app.inject({ method: "POST", url: `/api/sessoes/${id}/falas`, payload: { texto: "Hum, deixa eu pensar." } });
    await app.inject({ method: "POST", url: `/api/sessoes/${id}/relatorio` });
    expect(vistas.map((v) => v.maxTokens)).toEqual([1024, 4096]);
  });
});

describe("CORS", () => {
  it("aceita uma lista de origens separadas por vírgula", async () => {
    const app = buildApp({ llm: new MockProvider(), panelOrigin: "http://a, http://b" });
    const pede = (origin: string) =>
      app.inject({ method: "GET", url: "/api/progresso/j1", headers: { origin } });
    expect((await pede("http://b")).headers["access-control-allow-origin"]).toBe("http://b");
    expect((await pede("http://a")).headers["access-control-allow-origin"]).toBe("http://a");
    expect((await pede("http://c")).headers["access-control-allow-origin"]).toBeUndefined();
  });
});
