import { z } from "zod";
import { lerPrompt } from "./scenarios.js";
import type { Fala } from "./sessions.js";
import { LlmError, type CompleteOptions, type LlmProvider } from "./llm/types.js";

const Nivel = z.enum(["a_melhorar", "adequado", "bom"]);
const Criterio = z.enum(["assertividade", "escuta", "negociacao", "conflitos"]);

export const RelatorioSchema = z.object({
  criterios: z
    .array(
      z.object({
        nome: Criterio,
        nivel: Nivel,
        evidencia: z.string(),
        /** Por que esse nível: qual comportamento da rubrica apareceu (ou faltou) na evidência. */
        motivo: z.string().trim().min(1).max(400),
      }),
    )
    .length(4),
  ponto_forte: z.object({ trecho: z.string(), comentario: z.string() }),
  para_treinar: z.object({ criterio: Criterio, voce_disse: z.string(), tente: z.string() }),
  resultado: z.enum(["acordo", "sem_acordo", "sobrecarga_aceita"]),
});

export type Relatorio = z.infer<typeof RelatorioSchema>;

/**
 * Transcrição em JSON: o texto de cada fala fica entre aspas, então o jogador não
 * consegue fingir uma linha "MARINA:" nem escrever recados que pareçam parte do formato.
 */
export function formatarTranscricao(falas: Fala[]): string {
  return JSON.stringify(
    falas.map((f) => ({ autor: f.autor === "jogador" ? "jogador" : "marina", texto: f.texto })),
    null,
    1,
  );
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

const TENTATIVAS = 3;

export async function gerarRelatorio(
  llm: LlmProvider,
  falas: Fala[],
  opcoes: Pick<CompleteOptions, "model" | "reasoningEffort"> = {},
): Promise<Relatorio> {
  const mensagens = [
    { role: "system" as const, content: `${lerPrompt("avaliadora.md")}\n\n${lerPrompt("rubrica.md")}` },
    { role: "user" as const, content: `Transcrição (JSON):\n${formatarTranscricao(falas)}` },
  ];
  // Até 3 tentativas: a chamada pode falhar (tempo esgotado, resposta cortada, provedor
  // sobrecarregado) ou o relatório vir inválido ou com citação inventada. O motivo da
  // última falha vai no erro (e no log), nunca o texto da conversa.
  let motivo = "";
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    let bruto: string;
    try {
      bruto = await llm.complete(mensagens, { ...opcoes, json: true, maxTokens: 4096 });
    } catch (err) {
      motivo = err instanceof LlmError ? err.message : "falha na chamada";
      continue;
    }
    let r: Relatorio;
    try {
      r = RelatorioSchema.parse(extrairJson(bruto));
    } catch (err) {
      motivo = err instanceof SyntaxError ? "JSON inválido" : "JSON fora do formato";
      continue;
    }
    if (citacoesReais(r, falas)) return r;
    motivo = "citação que não é fala do jogador";
  }
  throw new LlmError(`A avaliadora não devolveu um relatório válido em ${TENTATIVAS} tentativas (${motivo})`);
}
