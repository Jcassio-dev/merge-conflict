// Copia o mapa do Tiled (pasta map/) para o jogo: panel/public/mapa/.
// Rode depois de editar o escritorio.tmj no Tiled: npm run mapa
// As cópias ficam no Git porque o build do Docker só enxerga a pasta panel/.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const origem = join(raiz, "map");
const destino = join(raiz, "panel/public/mapa");
mkdirSync(join(destino, "tilesets"), { recursive: true });

const mapa = JSON.parse(readFileSync(join(origem, "escritorio.tmj"), "utf8"));
for (const ts of mapa.tilesets) {
  if (!ts.image) throw new Error(`Tileset externo não suportado: ${ts.source}`);
  copyFileSync(join(origem, ts.image), join(destino, ts.image));
}
// Sem as propriedades do WorkAdventure que não servem ao jogo (script do mapa).
mapa.properties = (mapa.properties ?? []).filter((p) => p.name !== "script");
writeFileSync(join(destino, "escritorio.tmj"), JSON.stringify(mapa));
// Crédito e licença dos tilesets (CC BY-SA 3.0, WorkAdventure).
copyFileSync(join(origem, "LICENSE.assets"), join(destino, "LICENSE.assets"));
console.log(`mapa copiado: ${mapa.tilesets.length} tilesets`);
