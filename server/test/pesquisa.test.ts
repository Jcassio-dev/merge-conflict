import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MockProvider } from "../src/llm/mock.js";

const FALA = "Entendo a pressão. Com o login, a demo de sexta atrasa. Posso entregar na próxima sprint?";

async function conversaCompleta() {
  const pasta = mkdtempSync(join(tmpdir(), "pesquisa-"));
  const app = buildApp({ llm: new MockProvider(), pesquisa: { pasta, sal: "sal-de-teste" } });
  const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "navegador-da-ana" } });
  const id = s.json().sessaoId as string;
  await app.inject({ method: "POST", url: `/api/sessoes/${id}/falas`, payload: { texto: FALA } });
  await app.inject({ method: "POST", url: `/api/sessoes/${id}/relatorio` });
  const feedback = (payload: object) => app.inject({ method: "POST", url: `/api/sessoes/${id}/feedback`, payload });
  const ler = (arq: string) =>
    existsSync(join(pasta, arq)) ? readFileSync(join(pasta, arq), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  return { app, id, feedback, ler, pasta };
}

describe("dados do piloto", () => {
  it("cada conversa concluída vira uma linha anônima, sem o texto", async () => {
    const { ler, pasta } = await conversaCompleta();
    const [linha] = ler("conversas.jsonl");
    expect(linha).toMatchObject({ cenario: "cenario-1", tentativa: 1, resultado: "acordo", falasDoJogador: 1 });
    expect(Object.keys(linha.niveis)).toHaveLength(4);
    const bruto = readFileSync(join(pasta, "conversas.jsonl"), "utf8");
    expect(bruto).not.toContain("navegador-da-ana");
    expect(bruto).not.toContain("demo de sexta");
  });

  it("feedback sem ceder não guarda a conversa", async () => {
    const { feedback, ler } = await conversaCompleta();
    const r = await feedback({ util: 5, realista: 4, justo: 3, comentario: "Gostei" });
    expect(r.statusCode).toBe(201);
    expect(ler("feedback.jsonl")[0]).toMatchObject({ util: 5, realista: 4, justo: 3, comentario: "Gostei", cedeuConversa: false });
    expect(ler("cedidas.jsonl")).toEqual([]);
  });

  it("quem cede a conversa: guardada sem o id do navegador e com data para apagar", async () => {
    const { feedback, ler, pasta } = await conversaCompleta();
    await feedback({ util: 4, ceder: true });
    const [cedida] = ler("cedidas.jsonl");
    expect(cedida.falas.some((f: { texto: string }) => f.texto === FALA)).toBe(true);
    expect(Date.parse(cedida.apagarApos)).toBeGreaterThan(Date.now() + 80 * 24 * 60 * 60 * 1000);
    expect(readFileSync(join(pasta, "cedidas.jsonl"), "utf8")).not.toContain("navegador-da-ana");
    expect(cedida.jogador).toBe(ler("conversas.jsonl")[0].jogador);
  });

  it("uma resposta por conversa e só depois do relatório", async () => {
    const { feedback } = await conversaCompleta();
    expect((await feedback({ util: 3 })).statusCode).toBe(201);
    expect((await feedback({ util: 3 })).statusCode).toBe(409);

    const app = buildApp({ llm: new MockProvider() });
    const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j" } });
    const r = await app.inject({ method: "POST", url: `/api/sessoes/${s.json().sessaoId}/feedback`, payload: { util: 3 } });
    expect(r.statusCode).toBe(409);
  });

  it("quem pede para ficar fora da pesquisa não entra em nenhum arquivo", async () => {
    const pasta = mkdtempSync(join(tmpdir(), "pesquisa-"));
    const app = buildApp({ llm: new MockProvider(), pesquisa: { pasta, sal: "s" } });
    const s = await app.inject({ method: "POST", url: "/api/sessoes", payload: { jogadorId: "j", pesquisa: false } });
    const id = s.json().sessaoId as string;
    await app.inject({ method: "POST", url: `/api/sessoes/${id}/falas`, payload: { texto: FALA } });
    const rel = await app.inject({ method: "POST", url: `/api/sessoes/${id}/relatorio` });
    expect(rel.json().codigoPesquisa).toBeUndefined();
    const fb = await app.inject({ method: "POST", url: `/api/sessoes/${id}/feedback`, payload: { util: 5, ceder: true } });
    expect(fb.statusCode).toBe(409);
    expect(existsSync(join(pasta, "conversas.jsonl"))).toBe(false);
    expect(existsSync(join(pasta, "cedidas.jsonl"))).toBe(false);
  });

  it("nota fora de 1 a 5 é recusada", async () => {
    const { feedback } = await conversaCompleta();
    expect((await feedback({ util: 9 })).statusCode).toBe(400);
  });
});
