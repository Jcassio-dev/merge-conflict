import { z } from "zod";
import { contextoAvaliacao, lerPrompt, type Cenario } from "./scenarios.js";
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
    falas.map((f) => ({ autor: f.autor === "jogador" ? "jogador" : "personagem", texto: f.texto })),
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
  opcoes: Pick<CompleteOptions, "model" | "reasoningEffort"> & { cenario?: Cenario } = {},
): Promise<Relatorio> {
  const { cenario, ...llmOpcoes } = opcoes;
  const partes = [lerPrompt("avaliadora.md"), lerPrompt("rubrica.md")];
  if (cenario) partes.push(contextoAvaliacao(cenario));
  const mensagens = [
    { role: "system" as const, content: partes.join("\n\n") },
    { role: "user" as const, content: `Transcrição (JSON):\n${formatarTranscricao(falas)}` },
  ];
  // Até 3 tentativas: a chamada pode falhar (tempo esgotado, resposta cortada, provedor
  // sobrecarregado) ou o relatório vir inválido ou com citação inventada. O motivo da
  // última falha vai no erro (e no log), nunca o texto da conversa.
  let motivo = "";
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    let bruto: string;
    try {
      bruto = await llm.complete(mensagens, { ...llmOpcoes, json: true, maxTokens: 4096 });
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

const ORDEM_NIVEIS = ["a_melhorar", "adequado", "bom"] as const;

/**
 * Várias avaliações independentes, em paralelo, e o nível da maioria em cada critério
 * (Wang et al., 2023; Verga et al., 2024: juntar avaliações reduz o viés de um juiz só).
 * Se todas discordam num critério, fica o nível do meio e o critério volta em `divergentes`,
 * para revisão humana. Basta uma avaliação dar certo; se nenhuma der, o erro sobe.
 */
export async function gerarRelatorioVotado(
  llm: LlmProvider,
  falas: Fala[],
  votos: number,
  opcoes: Parameters<typeof gerarRelatorio>[2] = {},
): Promise<{ relatorio: Relatorio; divergentes: string[] }> {
  const tentativas = await Promise.allSettled(Array.from({ length: Math.max(1, votos) }, () => gerarRelatorio(llm, falas, opcoes)));
  const relatorios = tentativas.flatMap((t) => (t.status === "fulfilled" ? [t.value] : []));
  if (!relatorios.length) throw (tentativas[0] as PromiseRejectedResult).reason;
  if (relatorios.length === 1) return { relatorio: relatorios[0]!, divergentes: [] };

  const divergentes: string[] = [];
  const criterios = relatorios[0]!.criterios.map((base) => {
    const votosDoCriterio = relatorios.map((r) => r.criterios.find((c) => c.nome === base.nome) ?? base);
    const contagem = new Map<string, number>();
    for (const c of votosDoCriterio) contagem.set(c.nivel, (contagem.get(c.nivel) ?? 0) + 1);
    const [maisVotado, quantos] = [...contagem].sort((a, b) => b[1] - a[1])[0]!;
    let nivel = maisVotado;
    if (quantos === 1 && votosDoCriterio.length > 2) {
      // Empate total: o nível do meio entre os votos, e alguém revisa depois.
      const ordenados = votosDoCriterio.map((c) => ORDEM_NIVEIS.indexOf(c.nivel)).sort((a, b) => a - b);
      nivel = ORDEM_NIVEIS[ordenados[Math.floor(ordenados.length / 2)]!]!;
      divergentes.push(base.nome);
    }
    // Evidência e motivo de quem votou no nível escolhido, para o texto bater com o nível.
    return votosDoCriterio.find((c) => c.nivel === nivel)!;
  });

  const resultados = new Map<string, number>();
  for (const r of relatorios) resultados.set(r.resultado, (resultados.get(r.resultado) ?? 0) + 1);
  const resultado = [...resultados].sort((a, b) => b[1] - a[1])[0]![0] as Relatorio["resultado"];
  // Ponto forte e sugestão vêm da avaliação que mais concorda com o resultado final.
  const concordancia = (r: Relatorio) =>
    r.criterios.filter((c, i) => c.nivel === criterios[i]!.nivel).length + (r.resultado === resultado ? 1 : 0);
  const melhor = [...relatorios].sort((a, b) => concordancia(b) - concordancia(a))[0]!;
  return { relatorio: { ...melhor, criterios, resultado }, divergentes };
}
