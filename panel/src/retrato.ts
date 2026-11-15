// Retrato da Marina em pixel art, desenho próprio (não usa as peças Woka do
// WorkAdventure, que só podem ser usadas em mapas). Cada letra é um pixel.
const CORES: Record<string, string> = {
  k: "#4d3b39",
  h: "#8f7772",
  H: "#705654",
  L: "#b7a099",
  s: "#ffe1af",
  S: "#eebe93",
  r: "#f0a08c",
  e: "#3c2823",
  m: "#b5523b",
  w: "#f3f3f5",
  W: "#cdcdd4",
  t: "#309999",
  T: "#266e6e",
};

const PIXELS = [
  "........kkkkkkkk........",
  "......kkhhhhhhhhkk......",
  ".....khhLLhhhhhhhhk.....",
  "....khhLLhhhhhhhhhhk....",
  "...khhLhhhhhhhhhhHhhk...",
  "...khhhhhHHHHHHHHhhhk...",
  "..khhhhHHssssssssHhhhk..",
  "..khhhHsssssssssssHhhk..",
  "..khhHssseessssseesHhk..",
  "..khhHssseessssseesHhk..",
  ".khhhHsrrsssssssrrsHhhk.",
  ".khhhHSsssssmmssssSHhhk.",
  ".khhhhHSSssssssssSHhhhk.",
  ".khhHhhkSSSSSSSSSkhhHhk.",
  "khhHhhk..kSSSSSk..khhHhk",
  "khHhhkkkkwkSSSkwkkkkhhHk",
  "kHhhkwwwwwWkkkWwwwwwkhhk",
  ".kkkwwwwwwwWwWwwwwwwwkk.",
  "..kwwwwwwwwwtwwwwwwwwwk.",
  "..kwWwwwwwwwtwwwwwwwWwk.",
  ".kwwWwwwwwwwTwwwwwwwWwwk",
  ".kwwWwwwwwwwwwwwwwwwWwwk",
];

/** SVG do retrato; o tamanho na tela vem do CSS (.retrato svg). */
export function retratoMarina(): string {
  const rects = PIXELS.flatMap((linha, y) =>
    [...linha].flatMap((c, x) => (CORES[c] ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${CORES[c]}"/>`] : [])),
  ).join("");
  return `<svg viewBox="0 0 ${PIXELS[0]!.length} ${PIXELS.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
