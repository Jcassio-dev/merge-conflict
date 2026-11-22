// Retrato da personagem no painel. A Marina usa o sprite dela no mapa (gerado por
// map/ferramentas/montar-marina.py); as outras são montadas com as peças Woka.
import marina from "./assets/marina.png";
import { carregarPecas, folhaDoBoneco } from "./jogo/boneco";
import { personagemDo } from "./personagens";

export function retratoMarina(): string {
  return `<img src="${marina}" alt="" width="32" height="32">`;
}

/** HTML do retrato (img) da personagem do cenário. */
export async function retratoDe(cenarioId: string): Promise<string> {
  const p = personagemDo(cenarioId);
  if (!p?.aparencia) return retratoMarina();
  try {
    await carregarPecas(import.meta.env.BASE_URL);
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    // quadro parado, de frente (coluna 1, linha 0)
    c.getContext("2d")!.drawImage(folhaDoBoneco(p.aparencia), 32, 0, 32, 32, 0, 0, 32, 32);
    return `<img src="${c.toDataURL()}" alt="" width="32" height="32">`;
  } catch {
    return "";
  }
}
