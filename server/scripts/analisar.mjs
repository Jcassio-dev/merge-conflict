#!/usr/bin/env node
// Uso: node scripts/analisar.mjs <pasta-dos-dados>
// Gera <pasta>/analise/: resumo.txt, conversas.csv, feedback.csv e para-avaliar.csv.
// Se existir <pasta>/avaliacao-humana.csv (o para-avaliar.csv preenchido), mede a
// concordância entre a equipe e a IA.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pasta = process.argv[2];
if (!pasta) {
  console.error("Uso: node scripts/analisar.mjs <pasta-dos-dados>");
  process.exit(1);
}
const saida = join(pasta, "analise");
mkdirSync(saida, { recursive: true });

const CRITERIOS = ["assertividade", "escuta", "negociacao", "conflitos"];
const NIVEIS = ["a_melhorar", "adequado", "bom"];
const ITENS = { util: "Foi útil", realista: "A conversa pareceu real", justo: "O feedback foi justo" };

const ler = (arq) =>
  existsSync(join(pasta, arq))
    ? readFileSync(join(pasta, arq), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

// Apaga as conversas cedidas que passaram do prazo antes de qualquer outra coisa.
const todasCedidas = ler("cedidas.jsonl");
const cedidas = todasCedidas.filter((c) => Date.parse(c.apagarApos) > Date.now());
if (cedidas.length < todasCedidas.length) {
  const arq = join(pasta, "cedidas.jsonl");
  writeFileSync(`${arq}.tmp`, cedidas.map((c) => `${JSON.stringify(c)}\n`).join(""));
  renameSync(`${arq}.tmp`, arq);
}
const conversas = ler("conversas.jsonl");
const feedbacks = ler("feedback.jsonl");

const celula = (v) => {
  const t = v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  return /[;"\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
};
// ";" e BOM: o Excel em português abre direto; o Google Planilhas também.
const csv = (arq, colunas, linhas) =>
  writeFileSync(
    join(saida, arq),
    "﻿" + [colunas.join(";"), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(";"))].join("\n") + "\n",
  );

csv(
  "conversas.csv",
  ["quando", "sessao", "jogador", "cenario", "tentativa", ...CRITERIOS, "resultado", "falasDoJogador", "duracaoS", "votos", "divergentes"],
  conversas.map((c) => ({ ...c, ...c.niveis })),
);
csv("feedback.csv", ["quando", "sessao", "jogador", "cenario", ...Object.keys(ITENS), "comentario", "cedeuConversa"], feedbacks);
// Sem os níveis da IA: a equipe avalia às cegas.
csv(
  "para-avaliar.csv",
  ["sessao", "cenario", "conversa", ...CRITERIOS.map((c) => `humano_${c}`), "humano_resultado"],
  cedidas.map((c) => ({
    sessao: c.sessao,
    cenario: c.cenario,
    conversa: c.falas.map((f) => `${f.autor === "jogador" ? "Jogador" : "Personagem"}: ${f.texto}`).join("\n"),
  })),
);

// ---------- resumo ----------
const r = [];
const pct = (n, total) => (total ? `${Math.round((100 * n) / total)}%` : "-");
const media = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1).replace(".", ",") : "-");
const mediana = (xs) => {
  if (!xs.length) return "-";
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const contar = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});

r.push(`Resumo do piloto (gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})`, "");
r.push(`Jogadores: ${new Set(conversas.map((c) => c.jogador)).size}`);
r.push(`Conversas concluídas: ${conversas.length}`);
r.push(`Formulários respondidos: ${feedbacks.length} (${pct(feedbacks.length, conversas.length)} das conversas)`);
r.push(`Conversas cedidas para a pesquisa: ${cedidas.length}`, "");

for (const cenario of [...new Set(conversas.map((c) => c.cenario))].sort()) {
  const doCenario = conversas.filter((c) => c.cenario === cenario);
  r.push(`== ${cenario} (${doCenario.length} conversas, ${new Set(doCenario.map((c) => c.jogador)).size} jogadores)`);
  r.push(`Duração mediana: ${Math.round(mediana(doCenario.map((c) => c.duracaoS)) / 60)} min; falas do jogador (mediana): ${mediana(doCenario.map((c) => c.falasDoJogador))}`);
  r.push(`Repetiram o cenário: ${pct(doCenario.filter((c) => c.tentativa > 1).length, doCenario.length)}`);
  const res = contar(doCenario.map((c) => c.resultado));
  r.push(`Resultado: ${Object.entries(res).map(([k, n]) => `${k} ${pct(n, doCenario.length)}`).join(", ")}`);
  for (const crit of CRITERIOS) {
    const n = contar(doCenario.map((c) => c.niveis[crit]));
    r.push(`  ${crit.padEnd(14)} ${NIVEIS.map((nv) => `${nv} ${pct(n[nv] ?? 0, doCenario.length)}`).join(" | ")}`);
  }
  const div = doCenario.filter((c) => c.divergentes?.length).length;
  if (div) {
    const porCriterio = Object.entries(contar(doCenario.flatMap((c) => c.divergentes))).map(([k, n]) => `${k} ${n}`);
    r.push(`Avaliações em que a IA discordou de si mesma: ${div} (${porCriterio.join(", ")})`);
  }
  r.push("");
}

r.push("== Feedback dos jogadores (1 a 5)");
for (const [item, rotulo] of Object.entries(ITENS)) {
  const notas = feedbacks.map((f) => f[item]).filter((n) => typeof n === "number");
  const porCenario = [...new Set(feedbacks.map((f) => f.cenario))].sort()
    .map((c) => `${c} ${media(feedbacks.filter((f) => f.cenario === c && typeof f[item] === "number").map((f) => f[item]))}`);
  r.push(`${rotulo}: média ${media(notas)} (n=${notas.length}); ${porCenario.join(", ")}`);
}
const comentarios = feedbacks.filter((f) => f.comentario);
r.push("", `== Comentários (${comentarios.length})`);
for (const f of comentarios) r.push(`- [${f.cenario}] ${f.comentario}`);

// ---------- concordância equipe x IA ----------
const arqHumano = join(pasta, "avaliacao-humana.csv");
if (existsSync(arqHumano)) {
  const linhas = lerCsv(readFileSync(arqHumano, "utf8").replace(/^﻿/, ""));
  const [cab, ...dados] = linhas;
  const col = (nome) => cab.indexOf(nome);
  const ia = new Map(cedidas.map((c) => [c.sessao, c]));
  const normalizar = (v) => {
    const t = String(v ?? "").trim().toLowerCase().replace(" ", "_");
    return { "1": "a_melhorar", "2": "adequado", "3": "bom" }[t] ?? (NIVEIS.includes(t) ? t : undefined);
  };
  r.push("", "== Concordância entre a equipe e a IA");
  for (const crit of CRITERIOS) {
    const pares = dados
      .map((l) => [normalizar(l[col(`humano_${crit}`)]), ia.get(l[col("sessao")])?.niveisIA[crit]])
      .filter(([h, m]) => h && m);
    if (!pares.length) continue;
    const exata = pares.filter(([h, m]) => h === m).length;
    const vizinha = pares.filter(([h, m]) => Math.abs(NIVEIS.indexOf(h) - NIVEIS.indexOf(m)) <= 1).length;
    r.push(`${crit.padEnd(14)} n=${pares.length}  igual ${pct(exata, pares.length)}  até 1 nível ${pct(vizinha, pares.length)}  kappa ${kappaPonderado(pares).toFixed(2).replace(".", ",")}`);
  }
  r.push("Kappa ponderado (linear): acima de 0,6 é concordância boa; abaixo de 0,4, rever a rubrica ou o prompt.");
}

writeFileSync(join(saida, "resumo.txt"), r.join("\n") + "\n");
console.log(r.join("\n"));
console.log(`\nArquivos em ${saida}`);

// Kappa de Cohen com peso linear: discordar por um nível pesa metade de discordar por dois.
function kappaPonderado(pares) {
  const k = NIVEIS.length;
  const idx = pares.map(([h, m]) => [NIVEIS.indexOf(h), NIVEIS.indexOf(m)]);
  const n = idx.length;
  const peso = (i, j) => 1 - Math.abs(i - j) / (k - 1);
  const ph = NIVEIS.map((_, i) => idx.filter(([h]) => h === i).length / n);
  const pm = NIVEIS.map((_, j) => idx.filter(([, m]) => m === j).length / n);
  const obs = idx.reduce((s, [h, m]) => s + peso(h, m), 0) / n;
  let esp = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) esp += peso(i, j) * ph[i] * pm[j];
  return esp === 1 ? 1 : (obs - esp) / (1 - esp);
}

function lerCsv(texto) {
  const sep = texto.split("\n")[0].includes(";") ? ";" : ",";
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((x) => x !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
