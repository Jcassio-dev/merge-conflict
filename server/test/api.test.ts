import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MockProvider } from "../src/llm/mock.js";
import type { ChatMessage, LlmProvider } from "../src/llm/types.js";

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
