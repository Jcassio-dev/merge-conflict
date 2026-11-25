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
  /** Briefing: inclui os fatos que a rubrica espera que o jogador use. */
  situacao: string;
  meta: string;
  ficha: { titulo: string; passos: { nome: string; texto: string }[]; exemplo: string };
  reflexao: string;
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
      "Quarta-feira. A sprint termina na sexta, com demo para o cliente, e a equipe já está no limite: ainda falta terminar o relatório de exportação, que também entra na demo. Marina, a PO, vai pedir algo novo.",
    meta: "Dizer o que é possível sem romper com ela.",
    ficha: {
      titulo: "Dizer não sem romper",
      passos: [
        { nome: "Fato", texto: "O que está acontecendo, sem julgar a pessoa" },
        { nome: "Impacto", texto: "O que muda para a equipe ou para a entrega" },
        { nome: "Proposta", texto: "Uma alternativa concreta, e pergunte se serve" },
      ],
      exemplo: "“Se eu pegar mais isso, o que já estava combinado atrasa. O que é mais importante entregar primeiro?”",
    },
    reflexao: "Em que reunião real desta semana você pode usar fato, impacto e proposta?",
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
      "Segunda-feira. A diretoria quer lançar o módulo de pagamentos num evento na próxima sexta. Pela sua estimativa, o módulo (Pix, cartão e estorno) leva três semanas, e só a integração com o banco leva uma. Sérgio, seu gerente, vai pedir o prazo.",
    meta: "Dizer que o prazo não fecha, com dados, e propor uma saída.",
    ficha: {
      titulo: "Prazo apertado, com dados",
      passos: [
        { nome: "Dado", texto: "A estimativa e de onde ela vem" },
        { nome: "Risco", texto: "O que acontece se o prazo for apertado assim" },
        { nome: "Opções", texto: "O que cabe no prazo, e o que fica para depois" },
      ],
      exemplo: "“Do jeito que está, não cabe em uma semana sem cortar testes. O que a diretoria mais precisa mostrar no dia?”",
    },
    reflexao: "Quando alguém pedir um prazo apertado, que dado você vai levar para a conversa?",
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
      "Ontem você revisou o pull request do Diego e deixou doze comentários, vários dizendo só \"isso está errado\". O time inteiro viu. Dois apontavam problemas sérios (uma query sem índice e um erro no tratamento de exceção); o resto era questão de estilo. Ele veio falar com você.",
    meta: "Ouvir, separar a pessoa do problema e combinar um jeito melhor de revisar.",
    ficha: {
      titulo: "Ouvir e reparar",
      passos: [
        { nome: "Ouvir", texto: "Pergunte o que incomodou e repita com suas palavras" },
        { nome: "Reconhecer", texto: "Assuma a sua parte, sem se justificar" },
        { nome: "Separar", texto: "O que era sério e o que era só estilo" },
        { nome: "Combinar", texto: "Como revisar daqui para a frente" },
      ],
      exemplo: "“Faz sentido você ter se sentido exposto. O que mais pegou para você?”",
    },
    reflexao: "Na próxima revisão de código que você fizer, o que vai fazer diferente?",
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
    ficha: c.ficha,
    reflexao: c.reflexao,
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
