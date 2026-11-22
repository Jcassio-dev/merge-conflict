import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "../src/sessions.js";

const arquivoTemp = () => join(mkdtempSync(join(tmpdir(), "progresso-")), "progresso.json");

describe("progresso em disco", () => {
  it("sobrevive a um reinício da API; a conversa não vai para o disco", async () => {
    const arquivo = arquivoTemp();
    const a = new Store(arquivo);
    const s = a.criar("jogador-1", "cenario-1", "Oi, tudo bem?");
    s.falas.push({ autor: "jogador", texto: "fala secreta do jogador" });
    a.registrarConclusao(s, { escuta: "bom" });
    await a.salvar();

    const salvo = readFileSync(arquivo, "utf8");
    expect(salvo).not.toContain("fala secreta");
    expect(salvo).not.toContain("Oi, tudo bem");

    const b = new Store(arquivo);
    expect(b.progressoDe("jogador-1")["cenario-1"]).toEqual({ tentativas: 1, concluido: true, niveis: { escuta: "bom" } });
  });

  it("consultar progresso de quem nunca jogou não cria registro no disco", async () => {
    const arquivo = arquivoTemp();
    const a = new Store(arquivo);
    a.progressoDe("curioso");
    a.criar("j2", "cenario-1", "abertura");
    await a.salvar();
    expect(Object.keys(JSON.parse(readFileSync(arquivo, "utf8")))).toEqual(["j2"]);
  });

  it("arquivo corrompido não derruba a API: começa vazio", () => {
    const arquivo = arquivoTemp();
    writeFileSync(arquivo, "{ isso não é json");
    const a = new Store(arquivo);
    expect(a.progressoDe("j1")).toEqual({});
  });

  it("sem arquivo configurado, continua só em memória", async () => {
    const a = new Store();
    a.criar("j1", "cenario-1", "abertura");
    await expect(a.salvar()).resolves.toBeUndefined();
  });
});
