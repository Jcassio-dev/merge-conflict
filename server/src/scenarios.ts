import { readFileSync } from "node:fs";

const PROMPTS = new URL("../prompts/", import.meta.url);

export function lerPrompt(arquivo: string): string {
  return readFileSync(new URL(arquivo, PROMPTS), "utf8");
}

export type Cenario = {
  id: string;
  /** Posição na sequência do piloto (1, 2, 3): o cenário N abre depois do N-1. */
  ordem: number;
  titulo: string;
  personagem: {
    nome: string;
    papel: string;
    /** Voz do Gemini TTS (vazio = TTS_VOZ do .env). */
    voz?: string;
  };
  /** Texto do briefing (Tela 2): a situação e a meta, em segunda pessoa. */
  situacao: string;
  meta: string;
  /** Primeira fala da personagem, fixa (roteirizada). */
  abertura: string;
  /** Limite de falas do jogador. */
  maxTrocas: number;
  promptPersonagem: string;
  /** Exemplos da rubrica para este cenário (prompts/). */
  exemplosRubrica: string;
};

export const CENARIOS: Record<string, Cenario> = {
  "cenario-1": {
    id: "cenario-1",
    ordem: 1,
    titulo: "A mudança de última hora",
    personagem: { nome: "Marina", papel: "Product Owner", voz: "Kore" },
    situacao:
      "Quarta-feira. A sprint termina na sexta, com demo para o cliente. Marina, a PO, vai pedir algo novo.",
    meta: "Dizer o que é possível sem romper com ela.",
    abertura: "Oi! O cliente pediu e eu já prometi: o login com Google entra nessa sprint. A demo é sexta, tudo certo?",
    maxTrocas: 8,
    promptPersonagem: "marina.md",
    exemplosRubrica: "exemplos-cenario-1.md",
  },
  "cenario-2": {
    id: "cenario-2",
    ordem: 2,
    titulo: "O prazo que não fecha",
    personagem: { nome: "Sérgio", papel: "Gerente de engenharia", voz: "Charon" },
    situacao:
      "Segunda-feira. A diretoria quer lançar o módulo de pagamentos num evento na próxima sexta. Pela sua estimativa, o módulo leva três semanas. Sérgio, seu gerente, vai pedir o prazo.",
    meta: "Dizer que o prazo não fecha, com dados, e propor uma saída.",
    abertura:
      "Bom dia! A diretoria quer o módulo de pagamentos no ar até o evento da próxima sexta. Dá pra fechar em uma semana, né?",
    maxTrocas: 8,
    promptPersonagem: "sergio.md",
    exemplosRubrica: "exemplos-cenario-2.md",
  },
  "cenario-3": {
    id: "cenario-3",
    ordem: 3,
    titulo: "O code review que virou briga",
    personagem: { nome: "Diego", papel: "Dev sênior, seu colega de time", voz: "Puck" },
    situacao:
      "Ontem você revisou o pull request do Diego e deixou doze comentários, vários dizendo só \"isso está errado\". O time inteiro viu. Ele veio falar com você.",
    meta: "Ouvir, separar a pessoa do problema e combinar um jeito melhor de revisar.",
    abertura: "Vi seus comentários no meu PR. Doze, e metade dizendo que está errado. Na frente do time todo. Precisava disso?",
    maxTrocas: 8,
    promptPersonagem: "diego.md",
    exemplosRubrica: "exemplos-cenario-3.md",
  },
};

/** Dados do cenário que o painel pode ver (sem prompts). */
export function cenarioPublico(c: Cenario) {
  return {
    id: c.id,
    ordem: c.ordem,
    titulo: c.titulo,
    personagem: { nome: c.personagem.nome, papel: c.personagem.papel },
    situacao: c.situacao,
    meta: c.meta,
    maxTrocas: c.maxTrocas,
  };
}

/** Contexto do cenário para a avaliadora: quem é a personagem e o que o jogador precisava fazer. */
export function contextoAvaliacao(c: Cenario): string {
  return [
    `Cenário: ${c.titulo}`,
    `Personagem: ${c.personagem.nome} (${c.personagem.papel})`,
    `Situação: ${c.situacao}`,
    `Meta do jogador: ${c.meta}`,
    "",
    lerPrompt(c.exemplosRubrica),
  ].join("\n");
}

/** Marca que a personagem usa para encerrar a conversa. */
export const MARCA_FIM = "[FIM]";
