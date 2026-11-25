#!/usr/bin/env node
// Uso: node scripts/apagar-jogador.mjs <pasta-dos-dados> <codigo>
// Apaga tudo de um jogador que pediu para sair da pesquisa (o código aparece no fim do cenário).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [pasta, codigo] = process.argv.slice(2);
if (!pasta || !/^[0-9a-f]{12}$/.test(codigo ?? "")) {
  console.error("Uso: node scripts/apagar-jogador.mjs <pasta-dos-dados> <codigo de 12 caracteres>");
  process.exit(1);
}
let total = 0;
for (const arq of ["conversas.jsonl", "feedback.jsonl", "cedidas.jsonl"]) {
  const caminho = join(pasta, arq);
  if (!existsSync(caminho)) continue;
  const linhas = readFileSync(caminho, "utf8").split("\n").filter(Boolean);
  const ficam = linhas.filter((l) => JSON.parse(l).jogador !== codigo);
  total += linhas.length - ficam.length;
  writeFileSync(`${caminho}.tmp`, ficam.map((l) => `${l}\n`).join(""));
  renameSync(`${caminho}.tmp`, caminho);
}
console.log(`${total} registro(s) apagado(s). Os CSVs antigos em analise/ também devem ser gerados de novo.`);
