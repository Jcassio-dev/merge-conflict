import { describe, expect, it } from "vitest";
import { gerarRelatorio, gerarRelatorioVotado } from "../src/report.js";
import { LlmError, type LlmProvider } from "../src/llm/types.js";
import type { Fala } from "../src/sessions.js";

const falas: Fala[] = [
  { autor: "personagem", texto: "Preciso do login com Google até sexta." },
  { autor: "jogador", texto: "Entendo. Com o login, a demo atrasa. Posso entregar na próxima sprint?" },
];
const fala = falas[1]!.texto;

const valido = JSON.stringify({
  criterios: ["assertividade", "escuta", "negociacao", "conflitos"].map((nome) => ({
    nome,
    nivel: "adequado",
    evidencia: fala,
    motivo: "Disse o impacto e fez uma proposta, mas não perguntou o que a Marina precisa.",
  })),
  ponto_forte: { trecho: fala, comentario: "Boa proposta." },
  para_treinar: { criterio: "escuta", voce_disse: fala, principio: "Pergunte antes de propor.", tente: "O que pesa mais para você?" },
  resultado: "acordo",
});

/** Provedor que devolve (ou lança) cada item da lista, em ordem. */
function roteiro(passos: (string | Error)[]): LlmProvider & { chamadas: number } {
  return {
    chamadas: 0,
    async complete() {
      const passo = passos[this.chamadas++];
      if (passo instanceof Error) throw passo;
      return passo ?? valido;
    },
  };
}

describe("gerarRelatorio", () => {
  it("tenta de novo quando a chamada falha (tempo esgotado, resposta cortada)", async () => {
    const llm = roteiro([new LlmError("Falha ao chamar o provedor de LLM"), valido]);
    const r = await gerarRelatorio(llm, falas);
    expect(r.resultado).toBe("acordo");
    expect(llm.chamadas).toBe(2);
  });

  it("aguenta duas respostas ruins seguidas e aceita a terceira", async () => {
    const llm = roteiro(["isso não é json", new LlmError("Resposta cortada pelo limite de tokens"), valido]);
    await expect(gerarRelatorio(llm, falas)).resolves.toMatchObject({ resultado: "acordo" });
    expect(llm.chamadas).toBe(3);
  });

  it("motivo é obrigatório em cada critério: sem ele, tenta de novo", async () => {
    const semMotivo = JSON.stringify({ ...JSON.parse(valido), criterios: JSON.parse(valido).criterios.map((c: object) => ({ ...c, motivo: undefined })) });
    const llm = roteiro([semMotivo, valido]);
    const r = await gerarRelatorio(llm, falas);
    expect(r.criterios[0]!.motivo).toContain("impacto");
    expect(llm.chamadas).toBe(2);
  });

  it("a evidência de cada nível também tem de ser fala do jogador", async () => {
    const base = JSON.parse(valido);
    base.criterios[3].evidencia = "Preciso do login com Google até sexta.";
    const llm = roteiro([JSON.stringify(base), valido]);
    await gerarRelatorio(llm, falas);
    expect(llm.chamadas).toBe(2);
  });

  it("aceita relatório sem ponto forte quando nada mereceu elogio", async () => {
    const llm = roteiro([JSON.stringify({ ...JSON.parse(valido), ponto_forte: null })]);
    const r = await gerarRelatorio(llm, falas);
    expect(r.ponto_forte).toBeNull();
    expect(llm.chamadas).toBe(1);
  });

  it("desiste depois de 3 tentativas e diz o motivo da última, sem o texto da conversa", async () => {
    const inventado = valido.replaceAll(fala, "Uma fala que o jogador nunca disse.");
    const llm = roteiro([inventado, inventado, inventado]);
    const erro = await gerarRelatorio(llm, falas).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(LlmError);
    expect((erro as Error).message).toMatch(/citação/);
    expect((erro as Error).message).not.toContain("nunca disse");
    expect(llm.chamadas).toBe(3);
  });
});

describe("avaliação por votação (3 avaliadoras)", () => {
  const com = (niveis: string[], resultado = "acordo") =>
    JSON.stringify({
      ...JSON.parse(valido),
      criterios: JSON.parse(valido).criterios.map((c: { nome: string }, i: number) => ({ ...c, nivel: niveis[i], motivo: `motivo ${niveis[i]}` })),
      resultado,
    });

  it("fica o nível da maioria em cada critério, com o motivo de quem votou nele", async () => {
    const llm = roteiro([
      com(["bom", "adequado", "bom", "a_melhorar"]),
      com(["bom", "bom", "adequado", "a_melhorar"], "sem_acordo"),
      com(["adequado", "bom", "bom", "a_melhorar"]),
    ]);
    const { relatorio, divergentes } = await gerarRelatorioVotado(llm, falas, 3);
    expect(relatorio.criterios.map((c) => c.nivel)).toEqual(["bom", "bom", "bom", "a_melhorar"]);
    expect(relatorio.criterios.every((c) => c.motivo === `motivo ${c.nivel}`)).toBe(true);
    expect(relatorio.resultado).toBe("acordo");
    expect(divergentes).toEqual([]);
  });

  it("quando as três discordam, fica o nível do meio e o critério é marcado para revisar", async () => {
    const llm = roteiro([
      com(["bom", "bom", "bom", "bom"]),
      com(["adequado", "bom", "bom", "bom"]),
      com(["a_melhorar", "bom", "bom", "bom"]),
    ]);
    const { relatorio, divergentes } = await gerarRelatorioVotado(llm, falas, 3);
    expect(relatorio.criterios[0]!.nivel).toBe("adequado");
    expect(divergentes).toEqual(["assertividade"]);
  });

  it("aguenta uma avaliadora que falha: vota com as que responderam", async () => {
    const erro = new LlmError("Falha ao chamar o provedor de LLM (rede)");
    const llm = roteiro([com(["bom", "bom", "bom", "bom"]), erro, erro, erro, com(["bom", "bom", "bom", "bom"])]);
    const { relatorio } = await gerarRelatorioVotado(llm, falas, 3);
    expect(relatorio.criterios[0]!.nivel).toBe("bom");
  });
});
