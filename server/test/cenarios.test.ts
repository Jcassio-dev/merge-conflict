import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MockProvider } from "../src/llm/mock.js";
import type { ChatMessage, LlmProvider } from "../src/llm/types.js";
import type { VozProvider } from "../src/voz/types.js";

describe("três cenários em sequência", () => {
  it("lista os cenários em ordem, sem expor prompts", async () => {
    const app = buildApp({ llm: new MockProvider() });
    const res = await app.inject({ method: "GET", url: "/api/cenarios" });
    expect(res.statusCode).toBe(200);
    const lista = res.json().cenarios as { id: string; ordem: number; personagem: { nome: string } }[];
    expect(lista.map((c) => [c.id, c.ordem, c.personagem.nome])).toEqual([
      ["cenario-1", 1, "Marina"],
      ["cenario-2", 2, "Sérgio"],
      ["cenario-3", 3, "Diego"],
    ]);
    expect(res.body).not.toContain(".md");
    expect(res.body).not.toContain("Comportamento");
  });

  it("cada cenário usa o prompt da sua personagem e a abertura própria", async () => {
    const sistemas: string[] = [];
    const mock = new MockProvider();
    const llm: LlmProvider = {
      complete: async (msgs: ChatMessage[]) => {
        sistemas.push(msgs[0]!.content);
        return mock.complete(msgs);
      },
    };
    const app = buildApp({ llm });
    for (const [cenarioId, nome] of [["cenario-2", "Sérgio"], ["cenario-3", "Diego"]]) {
      const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j", cenarioId } });
      expect(s.statusCode).toBe(201);
      await app.inject({ method: "POST", url: `/api/sessoes/${s.json().sessaoId}/falas`, payload: { texto: "Oi." } });
      expect(sistemas.at(-1)).toContain(`Você é ${nome}`);
    }
  });

  it("a avaliadora recebe o contexto e os exemplos do cenário", async () => {
    let sistema = "";
    const mock = new MockProvider();
    const llm: LlmProvider = {
      complete: async (msgs: ChatMessage[]) => {
        if (msgs[0]!.content.includes("AVALIADORA")) sistema = msgs[0]!.content;
        return mock.complete(msgs);
      },
    };
    const app = buildApp({ llm });
    const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j", cenarioId: "cenario-3" } });
    const id = s.json().sessaoId as string;
    await app.inject({ method: "POST", url: `/api/sessoes/${id}/falas`, payload: { texto: "Entendo, vamos conversar." } });
    const rel = await app.inject({ method: "POST", url: `/api/sessoes/${id}/relatorio` });
    expect(rel.statusCode).toBe(200);
    expect(sistema).toContain("Personagem: Diego");
    expect(sistema).toContain("PR");
    expect(sistema).not.toContain("login com Google");
  });

  it("a voz usa a voz da personagem do cenário", async () => {
    const vozes: (string | undefined)[] = [];
    const voz: VozProvider = { sintetizar: async (_t, v) => (vozes.push(v), Buffer.from("RIFF")) };
    const app = buildApp({ llm: new MockProvider(), voz });
    const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j", cenarioId: "cenario-2" } });
    const r = await app.inject({ method: "GET", url: `/api/sessoes/${s.json().sessaoId}/falas/0/voz` });
    expect(r.statusCode).toBe(200);
    expect(vozes).toEqual(["Charon"]);
  });
});
