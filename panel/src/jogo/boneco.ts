// Bonecos dos jogadores, desenhados no navegador a partir das escolhas de cada um
// (pele, estilo e cor do cabelo, camisa, calça). Pixel art de 32x32, sem peças de terceiros.
//
// Folha de cada boneco: 3 colunas (parado, passo esquerdo, passo direito) x 4 linhas
// (baixo, esquerda, direita, cima).

import type { Direcao } from "./rede";

export type Aparencia = { pele: number; estilo: number; cabelo: number; camisa: number; calca: number };
type Cor = readonly [number, number, number];

export const PELES: Cor[] = [
  [255, 219, 172], [241, 194, 125], [224, 172, 105], [198, 134, 66], [141, 85, 36], [101, 60, 30],
];
export const ESTILOS = ["Curto", "Comprido", "Cacheado", "Raspado"] as const;
export const CABELOS: Cor[] = [
  [34, 34, 40], [90, 58, 34], [60, 38, 24], [181, 83, 42], [230, 193, 90], [136, 136, 140], [122, 91, 214],
];
export const CAMISAS: Cor[] = [
  [59, 184, 166], [242, 165, 65], [122, 91, 214], [214, 80, 74], [61, 123, 217], [91, 171, 74], [236, 236, 230], [60, 60, 72],
];
export const CALCAS: Cor[] = [[47, 54, 80], [92, 64, 44], [70, 70, 76], [120, 140, 170]];

/** Nomes das opções, lidos por leitores de tela e mostrados ao passar o mouse. */
export const NOMES: Record<"pele" | "cabelo" | "camisa" | "calca", string[]> = {
  pele: ["Clara", "Clara rosada", "Média", "Morena", "Escura", "Bem escura"],
  cabelo: ["Preto", "Castanho", "Castanho escuro", "Ruivo", "Loiro", "Grisalho", "Roxo"],
  camisa: ["Verde-água", "Laranja", "Roxa", "Vermelha", "Azul", "Verde", "Branca", "Preta"],
  calca: ["Azul-marinho", "Marrom", "Cinza", "Jeans claro"],
};

export const LIMITES: Record<keyof Aparencia, number> = {
  pele: PELES.length, estilo: ESTILOS.length, cabelo: CABELOS.length, camisa: CAMISAS.length, calca: CALCAS.length,
};

export const DIRECOES: Direcao[] = ["baixo", "esquerda", "direita", "cima"];
const T = 32;
const CONTORNO: Cor = [43, 40, 58];
const OLHO: Cor = [35, 30, 45];
const SAPATO: Cor = [30, 30, 40];

/** Aparência válida a partir de qualquer valor (do navegador ou da rede). */
export function aparenciaValida(bruta: unknown): Aparencia {
  const a = (bruta ?? {}) as Record<string, unknown>;
  const campo = (k: keyof Aparencia) => {
    const v = a[k];
    return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < LIMITES[k] ? v : 0;
  };
  return { pele: campo("pele"), estilo: campo("estilo"), cabelo: campo("cabelo"), camisa: campo("camisa"), calca: campo("calca") };
}

export function aparenciaAleatoria(): Aparencia {
  const r = (n: number) => Math.floor(Math.random() * n);
  return { pele: r(PELES.length), estilo: r(ESTILOS.length), cabelo: r(CABELOS.length), camisa: r(CAMISAS.length), calca: r(CALCAS.length) };
}

const escurecer = (c: Cor, f = 0.75): Cor => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
const css = (c: Cor) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
export const corCss = css;

const cache = new Map<string, HTMLCanvasElement>();

/** Folha 96x128 do boneco (cache por aparência). */
export function folhaDoBoneco(a: Aparencia): HTMLCanvasElement {
  const chave = `${a.pele}.${a.estilo}.${a.cabelo}.${a.camisa}.${a.calca}`;
  let folha = cache.get(chave);
  if (folha) return folha;
  folha = document.createElement("canvas");
  folha.width = 3 * T;
  folha.height = 4 * T;
  const ctx = folha.getContext("2d")!;
  DIRECOES.forEach((dir, d) => {
    for (let q = 0; q < 3; q++) desenhar(ctx, a, dir, q, q * T, d * T);
  });
  cache.set(chave, folha);
  return folha;
}

function desenhar(ctx: CanvasRenderingContext2D, a: Aparencia, dir: Direcao, quadro: number, ox: number, oy: number): void {
  const pele = PELES[a.pele]!;
  const cabelo = CABELOS[a.cabelo]!;
  const camisa = CAMISAS[a.camisa]!;
  const calca = CALCAS[a.calca]!;
  const estilo = ESTILOS[a.estilo]!;
  const px = new Map<number, Cor>();
  const ret = (x0: number, y0: number, x1: number, y1: number, cor: Cor) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px.set(y * T + x, cor);
  };

  // quadro 0 parado; 1 e 2 dão o passo com uma perna e sobem o corpo 1 px
  const sobe = quadro === 0 ? 0 : 1;
  const pernaE = quadro === 1 ? 1 : 0;
  const pernaD = quadro === 2 ? 1 : 0;
  const lado = dir === "esquerda" || dir === "direita";

  // pernas e sapatos
  if (lado) {
    const abre = ([[0, 0], [-2, 2], [2, -2]] as const)[quadro]!;
    for (const dx of abre) {
      ret(14 + dx, 24, 17 + dx, 27, calca);
      ret(14 + dx, 28, 17 + dx, 28, SAPATO);
    }
  } else {
    ret(11, 24, 14, 27 - pernaE, calca);
    ret(11, 28 - pernaE, 14, 28 - pernaE, SAPATO);
    ret(17, 24, 20, 27 - pernaD, calca);
    ret(17, 28 - pernaD, 20, 28 - pernaD, SAPATO);
  }

  // cabelo comprido de costas cai por cima da camisa: desenha antes do corpo só nos lados
  const yc = 4 - sobe;
  const yCorpo = 17 - sobe;

  // corpo e braços
  ret(10, yCorpo, 21, 24 - sobe, camisa);
  ret(9, yCorpo + 1, 22, 23 - sobe, camisa);
  if (lado) {
    const balanco = ([0, -1, 1] as const)[quadro]!;
    const bx = dir === "direita" ? 15 : 14;
    ret(bx, yCorpo + 2 + balanco, bx + 2, 22 - sobe + balanco, escurecer(camisa));
    ret(bx, 23 - sobe + balanco, bx + 2, 23 - sobe + balanco, pele);
  } else {
    ret(8, yCorpo + 1, 9, 22 - sobe, escurecer(camisa));
    ret(22, yCorpo + 1, 23, 22 - sobe, escurecer(camisa));
    ret(8, 23 - sobe, 9, 23 - sobe, pele);
    ret(22, 23 - sobe, 23, 23 - sobe, pele);
  }

  // cabelo comprido: mechas que descem até os ombros
  if (estilo === "Comprido") {
    if (dir === "cima") ret(9, yc + 8, 22, yc + 17, cabelo);
    else if (dir === "baixo") {
      ret(8, yc + 4, 10, yc + 16, cabelo);
      ret(21, yc + 4, 23, yc + 16, cabelo);
    } else if (dir === "esquerda") ret(17, yc + 4, 22, yc + 16, cabelo);
    else ret(9, yc + 4, 14, yc + 16, cabelo);
  }

  // cabeça
  ret(10, yc + 1, 21, yc + 12, pele);
  ret(9, yc + 3, 22, yc + 10, pele);
  ret(11, yc, 20, yc + 13, pele);

  // cabelo
  if (estilo === "Raspado") {
    const fino = escurecer(cabelo, 1);
    if (dir === "cima") {
      ret(10, yc, 21, yc + 7, fino);
      ret(9, yc + 3, 22, yc + 6, fino);
    } else {
      ret(11, yc, 20, yc + 1, fino);
      ret(10, yc + 1, 21, yc + 2, fino);
      if (dir === "esquerda") ret(19, yc + 2, 21, yc + 5, fino);
      if (dir === "direita") ret(10, yc + 2, 12, yc + 5, fino);
    }
  } else {
    const volume = estilo === "Cacheado" ? 1 : 0;
    if (dir === "cima") {
      ret(10 - volume, yc - volume, 21 + volume, yc + 10, cabelo);
      ret(9 - volume, yc + 2, 22 + volume, yc + 9 + volume, cabelo);
      ret(11, yc - 1 - volume, 20, yc + 11, cabelo);
    } else {
      ret(11 - volume, yc - 1 - volume, 20 + volume, yc + 2, cabelo);
      ret(9 - volume, yc + 1 - volume, 22 + volume, yc + 4, cabelo);
      if (dir === "baixo") {
        ret(9 - volume, yc + 5, 10, yc + 8 + volume * 2, cabelo);
        ret(21, yc + 5, 22 + volume, yc + 8 + volume * 2, cabelo);
      } else if (dir === "esquerda") ret(18, yc + 5, 22 + volume, yc + 9 + volume, cabelo);
      else ret(9 - volume, yc + 5, 13, yc + 9 + volume, cabelo);
    }
    if (estilo === "Cacheado") {
      // cachinhos: pixels mais escuros espalhados
      const escuro = escurecer(cabelo, 0.7);
      for (const [x, y] of [[11, yc], [15, yc - 1], [19, yc], [9, yc + 3], [22, yc + 3], [13, yc + 2], [17, yc + 2]] as const) {
        if (px.get(y * T + x) === cabelo) px.set(y * T + x, escuro);
      }
    }
  }

  // rosto
  if (dir === "baixo") {
    ret(12, yc + 7, 13, yc + 8, OLHO);
    ret(18, yc + 7, 19, yc + 8, OLHO);
    ret(14, yc + 11, 17, yc + 11, escurecer(pele, 0.8));
  } else if (dir === "esquerda") ret(11, yc + 7, 12, yc + 8, OLHO);
  else if (dir === "direita") ret(19, yc + 7, 20, yc + 8, OLHO);

  // sombra no chão
  ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
  ctx.fillRect(ox + 10, oy + 30, 12, 1);
  ctx.fillRect(ox + 12, oy + 31, 8, 1);
  // contorno: pixel vazio vizinho de um pixel preenchido
  ctx.fillStyle = css(CONTORNO);
  for (const i of px.keys()) {
    const x = i % T;
    const y = Math.floor(i / T);
    for (const [vx, vy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (vx >= 0 && vy >= 0 && vx < T && vy < T && !px.has(vy * T + vx)) ctx.fillRect(ox + vx, oy + vy, 1, 1);
    }
  }
  for (const [i, cor] of px) {
    const x = i % T;
    const y = Math.floor(i / T);
    if (y < 0 || y >= T) continue;
    ctx.fillStyle = css(cor);
    ctx.fillRect(ox + x, oy + y, 1, 1);
  }
}
