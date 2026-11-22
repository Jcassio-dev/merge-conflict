// Bonecos dos jogadores montados com as peças Woka do WorkAdventure
// (panel/public/mapa/woka/, geradas por map/ferramentas/montar-woka.py).
// Peças: AGPL v3 com Commons Clause, (c) TheCodingMachine. Uso sem venda, com crédito.
//
// Cada peça é uma folha de 96x128: 3 quadros (o do meio é o parado) x 4 direções
// (baixo, esquerda, direita, cima). O boneco é a soma das camadas, nesta ordem.

import type { Direcao } from "./rede";

export const PARTES = ["corpo", "olhos", "cabelo", "roupa", "chapeu", "acessorio"] as const;
export type Parte = (typeof PARTES)[number];
/** Índice da peça em cada camada (-1 = nenhuma, só chapéu e acessório) e a cor do cabelo. */
export type Aparencia = Record<Parte, number> & { corCabelo: string };

/** Cores prontas do cabelo; o jogador também pode escolher qualquer outra. */
export const CORES_CABELO: { nome: string; cor: string }[] = [
  { nome: "Preto", cor: "#2b2420" },
  { nome: "Castanho escuro", cor: "#4a2f1f" },
  { nome: "Castanho", cor: "#7a4e2d" },
  { nome: "Ruivo", cor: "#b5532a" },
  { nome: "Loiro escuro", cor: "#a8823f" },
  { nome: "Loiro", cor: "#e3bf5f" },
  { nome: "Grisalho", cor: "#9b9a98" },
  { nome: "Branco", cor: "#ecebe6" },
  { nome: "Rosa", cor: "#d0609a" },
  { nome: "Azul", cor: "#3d6fd1" },
];
const COR_HEX = /^#[0-9a-f]{6}$/i;

const ARQUIVO: Record<Parte, string> = {
  corpo: "color", olhos: "eyes", cabelo: "hairs", roupa: "clothes", chapeu: "hats", acessorio: "accessories",
};
export const OPCIONAL: Record<Parte, boolean> = {
  corpo: false, olhos: false, cabelo: false, roupa: false, chapeu: true, acessorio: true,
};
export const ROTULO: Record<Parte, string> = {
  corpo: "Pele", olhos: "Olhos", cabelo: "Cabelo", roupa: "Roupa", chapeu: "Chapéu", acessorio: "Acessório",
};

export const DIRECOES: Direcao[] = ["baixo", "esquerda", "direita", "cima"];
const L = 96;
const A = 128;

let colunas = 10;
const atlas = {} as Record<Parte, HTMLImageElement>;
export const TOTAL = {} as Record<Parte, number>;

/** Carrega as peças. Precisa terminar antes de desenhar qualquer boneco. */
export async function carregarPecas(base: string): Promise<void> {
  const res = await fetch(`${base}mapa/woka/woka.json`);
  if (!res.ok) throw new Error("Peças dos bonecos não carregaram");
  const dados = (await res.json()) as { colunas: number; total: Record<string, number> };
  colunas = dados.colunas;
  await Promise.all(
    PARTES.map(async (p) => {
      TOTAL[p] = dados.total[ARQUIVO[p]] ?? 0;
      atlas[p] = await carregar(`${base}mapa/woka/${ARQUIVO[p]}.png`);
    }),
  );
}

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Imagem não carregou: ${url}`));
    img.src = url;
  });
}

/** Aparência válida a partir de qualquer valor (do navegador ou da rede). */
export function aparenciaValida(bruta: unknown): Aparencia {
  const a = (typeof bruta === "object" && bruta ? bruta : {}) as Record<string, unknown>;
  const limpa = { corCabelo: typeof a.corCabelo === "string" && COR_HEX.test(a.corCabelo) ? a.corCabelo.toLowerCase() : CORES_CABELO[1]!.cor } as Aparencia;
  for (const p of PARTES) {
    const v = a[p];
    const min = OPCIONAL[p] ? -1 : 0;
    const total = TOTAL[p] ?? 1;
    limpa[p] = typeof v === "number" && Number.isInteger(v) && v >= min && v < total ? v : OPCIONAL[p] ? -1 : 0;
  }
  return limpa;
}

export function aparenciaAleatoria(): Aparencia {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    corpo: r(TOTAL.corpo),
    olhos: r(TOTAL.olhos),
    cabelo: r(TOTAL.cabelo),
    corCabelo: CORES_CABELO[r(8)]!.cor, // sorteio só entre as cores naturais
    roupa: r(TOTAL.roupa),
    // chapéu e acessório só às vezes, para o sorteio não ficar carnavalesco
    chapeu: Math.random() < 0.3 ? r(TOTAL.chapeu) : -1,
    acessorio: Math.random() < 0.3 ? r(TOTAL.acessorio) : -1,
  };
}

const cache = new Map<string, HTMLCanvasElement>();

/** Folha 96x128 do boneco montado (cache por aparência). */
export function folhaDoBoneco(a: Aparencia): HTMLCanvasElement {
  const chave = `${PARTES.map((p) => a[p]).join(".")}.${a.corCabelo}`;
  let folha = cache.get(chave);
  if (folha) return folha;
  folha = document.createElement("canvas");
  folha.width = L;
  folha.height = A;
  const ctx = folha.getContext("2d")!;
  for (const p of PARTES) {
    const i = a[p];
    if (i < 0 || !atlas[p]) continue;
    if (p === "cabelo") ctx.drawImage(cabeloPintado(i, a.corCabelo), 0, 0);
    else ctx.drawImage(atlas[p], (i % colunas) * L, Math.floor(i / colunas) * A, L, A, 0, 0, L, A);
  }
  if (cache.size > 200) cache.clear();
  cache.set(chave, folha);
  return folha;
}

/** O cabelo vem em tons de cinza (montar-woka.py); aqui vira a cor escolhida, com luz e sombra. */
function cabeloPintado(i: number, cor: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = L;
  c.height = A;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(atlas.cabelo, (i % colunas) * L, Math.floor(i / colunas) * A, L, A, 0, 0, L, A);
  const img = g.getImageData(0, 0, L, A);
  const r = parseInt(cor.slice(1, 3), 16);
  const gr = parseInt(cor.slice(3, 5), 16);
  const b = parseInt(cor.slice(5, 7), 16);
  // Multiplica: o cinza claro vira a cor, o escuro vira sombra. Um pouco de clareamento
  // nos tons altos evita que cores escuras (preto) virem um borrão sem detalhe.
  for (let k = 0; k < img.data.length; k += 4) {
    if (!img.data[k + 3]) continue;
    const v = img.data[k]! / 255;
    const luz = Math.max(0, v - 0.85) * 120;
    img.data[k] = Math.min(255, r * v + luz);
    img.data[k + 1] = Math.min(255, gr * v + luz);
    img.data[k + 2] = Math.min(255, b * v + luz);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Quadro da folha: parado é o do meio; andando alterna 0, 1, 2, 1. */
export function quadroDoPasso(andando: boolean, passo: number): number {
  return andando ? [0, 1, 2, 1][Math.floor(passo / 0.14) % 4]! : 1;
}
