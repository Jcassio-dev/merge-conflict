import { readFileSync } from "node:fs";

const PROMPTS = new URL("../prompts/", import.meta.url);

export function lerPrompt(arquivo: string): string {
  return readFileSync(new URL(arquivo, PROMPTS), "utf8");
}

export type Cenario = {
  id: string;
  titulo: string;
  /** Primeira fala da personagem, fixa (roteirizada). */
  abertura: string;
  /** Limite de falas do jogador. */
  maxTrocas: number;
  promptPersonagem: string;
};

export const CENARIOS: Record<string, Cenario> = {
  "cenario-1": {
    id: "cenario-1",
    titulo: "A mudança de última hora",
    abertura: "Oi! O cliente pediu e eu já prometi: o login com Google entra nessa sprint. A demo é sexta, tudo certo?",
    maxTrocas: 8,
    promptPersonagem: "marina.md",
  },
};

/** Marca que a personagem usa para encerrar a conversa. */
export const MARCA_FIM = "[FIM]";
