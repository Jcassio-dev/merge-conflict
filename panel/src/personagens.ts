// Personagens dos cenários, como aparecem no escritório e no painel.
// O conteúdo da conversa (prompt, abertura, meta) fica no server/ (scenarios.ts).
import type { Aparencia } from "./jogo/boneco";

export type Personagem = {
  cenarioId: string;
  ordem: number;
  nome: string;
  /** Artigo para frases como "Ir até o Sérgio". */
  artigo: "o" | "a";
  /** Onde fica no escritório (para o jogador achar). */
  local: string;
  /** Boneco montado com as peças Woka. A Marina não tem: ela faz parte do mapa (Tiled). */
  aparencia?: Aparencia;
  /** Tile onde a personagem fica (só para quem não está no mapa). */
  tile?: { x: number; y: number };
};

export const PERSONAGENS: Personagem[] = [
  { cenarioId: "cenario-1", ordem: 1, nome: "Marina", artigo: "a", local: "na sala Projeto, no canto direito" },
  {
    cenarioId: "cenario-2",
    ordem: 2,
    nome: "Sérgio",
    artigo: "o",
    local: "na sala de estar, no canto de cima à esquerda",
    aparencia: { corpo: 8, olhos: 3, cabelo: 2, roupa: 10, chapeu: -1, corCabelo: "#9b9a98" },
    tile: { x: 4, y: 6 },
  },
  {
    cenarioId: "cenario-3",
    ordem: 3,
    nome: "Diego",
    artigo: "o",
    local: "na mesa grande, no meio do escritório",
    aparencia: { corpo: 12, olhos: 1, cabelo: 6, roupa: 4, chapeu: -1, corCabelo: "#2b2420" },
    tile: { x: 15, y: 9 },
  },
];

export const personagemDo = (cenarioId: string) => PERSONAGENS.find((p) => p.cenarioId === cenarioId);
