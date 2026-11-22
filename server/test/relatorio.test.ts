import { describe, expect, it } from "vitest";
import { gerarRelatorio } from "../src/report.js";
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
  })),
  ponto_forte: { trecho: fala, comentario: "Boa proposta." },
  para_treinar: { criterio: "escuta", voce_disse: fala, tente: "O que pesa mais para você?" },
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
