// Retrato da Marina em pixel art, desenho próprio inspirado no sprite dela no mapa
// (as peças Woka do WorkAdventure só podem ser usadas em mapas, então não são copiadas).
// Cada letra é um pixel.
const CORES: Record<string, string> = {
  k: "#4d3b39",
  h: "#8f7772",
  H: "#705654",
  L: "#b7a099",
  s: "#ffe1af",
  S: "#eebe93",
  o: "#534721",
  i: "#b06228",
  I: "#6e3a16",
  e: "#ffffff",
  r: "#f0a08c",
  m: "#b5523b",
  w: "#f3f3f5",
  W: "#cdcdd4",
};

const PIXELS = [
  "..........kkkk..........",
  "......kkkkhhhhkkkk......",
  ".....khhhLLhhhhhhhk.....",
  "....khhhLLhhhhhhhhhk....",
  "...khhhhhhhhhhhHhhhhk...",
  "...khhhhhhhhhhhhHhhhk...",
  "..khhhHhhhhHhhhhhHhhhk..",
  "..khhHhhhhHhhhhhhhHhhk..",
  "..khhHsHhHssHhhHsshHhk..",
  ".khhhHooosssssooooHhhhk.",
  ".khhHsoiIesssoiIeosHhhk.",
  ".khhHsiIisssssiIisSHhhk.",
  ".khhHrsiiSssssiiSrsHhhk.",
  ".khhhHSsssssmsssssHhhhk.",
  "khhhhhHSSssssssSSHhhhhhk",
  "khhHhhhkkSSSSSSkkhhhHhhk",
  "khhHhhkwwwkSSkwwwkhhHhhk",
  "kHhhhkwwwwwkkwwwwwkhhhHk",
  "khhhkwwwwwwwwwwwwwwkhhhk",
  ".kkhkwWwwwwwwwwwwwWwkhk.",
  "..kkwwWwwwwwwwwwwwWwwkk.",
  "..kwwwWwwwwwwwwwwwWwwwk.",
];

/** SVG do retrato; o tamanho na tela vem do CSS (.retrato svg). */
export function retratoMarina(): string {
  const rects = PIXELS.flatMap((linha, y) =>
    [...linha].flatMap((c, x) => (CORES[c] ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${CORES[c]}"/>`] : [])),
  ).join("");
  return `<svg viewBox="0 0 ${PIXELS[0]!.length} ${PIXELS.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
