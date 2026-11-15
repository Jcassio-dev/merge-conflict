import { z } from "zod";
import { lerPrompt } from "./scenarios.js";
import type { Fala } from "./sessions.js";
import { LlmError, type CompleteOptions, type LlmProvider } from "./llm/types.js";

const Nivel = z.enum(["a_melhorar", "adequado", "bom"]);
const Criterio = z.enum(["assertividade", "escuta", "negociacao", "conflitos"]);

export const RelatorioSchema = z.object({
  criterios: z
    .array(z.object({ nome: Criterio, nivel: Nivel, evidencia: z.string() }))
    .length(4),
  ponto_forte: z.object({ trecho: z.string(), comentario: z.string() }),
  para_treinar: z.object({ criterio: Criterio, voce_disse: z.string(), tente: z.string() }),
  resultado: z.enum(["acordo", "sem_acordo", "sobrecarga_aceita"]),
});

export type Relatorio = z.infer<typeof RelatorioSchema>;

export function formatarTranscricao(falas: Fala[]): string {
  return falas.map((f) => `${f.autor === "jogador" ? "JOGADOR" : "MARINA"}: ${f.texto}`).join("\n");
}

const normalizar = (t: string) => t.toLowerCase().replace(/[“”"'.,!?…]/g, "").replace(/\s+/g, " ").trim();

/** Garante que as citações vêm de falas reais do jogador (evita avaliação inventada). */
export function citacoesReais(r: Relatorio, falas: Fala[]): boolean {
  const doJogador = falas.filter((f) => f.autor === "jogador").map((f) => normalizar(f.texto));
  const existe = (c: string) => {
    const n = normalizar(c);
    return n.length > 0 && doJogador.some((f) => f.includes(n));
  };
  return existe(r.ponto_forte.trecho) && existe(r.para_treinar.voce_disse);
}

function extrairJson(texto: string): unknown {
  const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  return JSON.parse(ini >= 0 && fim > ini ? limpo.slice(ini, fim + 1) : limpo);
}

export async function gerarRelatorio(
  llm: LlmProvider,
  falas: Fala[],
  opcoes: Pick<CompleteOptions, "model" | "reasoningEffort"> = {},
): Promise<Relatorio> {
  const mensagens = [
    { role: "system" as const, content: `${lerPrompt("avaliadora.md")}\n\n${lerPrompt("rubrica.md")}` },
    { role: "user" as const, content: `Transcrição:\n${formatarTranscricao(falas)}` },
  ];
  // Uma nova tentativa se o JSON vier inválido ou com citação inventada.
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const bruto = await llm.complete(mensagens, { ...opcoes, json: true, maxTokens: 900 });
    try {
      const r = RelatorioSchema.parse(extrairJson(bruto));
      if (citacoesReais(r, falas)) return r;
    } catch {
      // tenta de novo
    }
  }
  throw new LlmError("A avaliadora não devolveu um relatório válido");
}
