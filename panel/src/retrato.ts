// Retrato da Marina no painel: o mesmo sprite dela no mapa (gerado por
// map/ferramentas/montar-marina.py), ampliado sem suavizar os pixels.
import marina from "./assets/marina.png";

export function retratoMarina(): string {
  return `<img src="${marina}" alt="" width="32" height="32">`;
}
