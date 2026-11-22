import "./style.css";
import { retratoDe } from "./retrato";
import { microfoneDisponivel, ouvir, parar as pararVoz, tocar, type Escuta } from "./voz";
import { api, ApiError, type InfoCenario, type Fala, type Nivel, type NomeCriterio, type Relatorio } from "./api";

// ---------- parâmetros e armazenamento local ----------
const params = new URLSearchParams(location.search);
const cenarioId = params.get("cenario") ?? "cenario-1";
const jogadorId = params.get("jogador") ?? idLocal();

function idLocal(): string {
  try {
    const salvo = localStorage.getItem("cd-jogador");
    if (salvo) return salvo;
    const novo = crypto.randomUUID();
    localStorage.setItem("cd-jogador", novo);
    return novo;
  } catch {
    return crypto.randomUUID();
  }
}

function lerLocal(chave: string): string {
  try { return localStorage.getItem(chave) ?? ""; } catch { return ""; }
}
function salvarLocal(chave: string, valor: string): void {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento: ignora */ }
}

// ---------- estado ----------
type Tela = "briefing" | "dialogo" | "encerrada" | "relatorio" | "reflexao";
const estado = {
  tela: "briefing" as Tela,
  sessaoId: "",
  maxTrocas: 8,
  troca: 0,
  falas: [] as Fala[],
  aguardando: false,
  erro: "",
  textoPendente: "",
  relatorio: undefined as Relatorio | undefined,
  aba: "resumo" as "resumo" | "detalhe",
  /** O servidor tem voz para a personagem? */
  voz: false,
  /** Preferência do jogador (fica no navegador). */
  vozLigada: lerLocal("cd-voz") !== "desligada",
  ouvindo: false,
  avisoMic: "",
};
let escuta: Escuta | undefined;

const app = document.querySelector<HTMLElement>("#app")!;
const ficha = document.querySelector<HTMLDialogElement>("#ficha")!;

const esc = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const NOMES: Record<NomeCriterio, string> = {
  assertividade: "Assertividade",
  escuta: "Escuta",
  negociacao: "Negociação",
  conflitos: "Resolução de conflitos",
};
const NIVEIS: Record<Nivel, { texto: string; passos: number }> = {
  a_melhorar: { texto: "a melhorar", passos: 1 },
  adequado: { texto: "adequado", passos: 2 },
  bom: { texto: "bom", passos: 3 },
};
const RESULTADOS: Record<Relatorio["resultado"], string> = {
  acordo: "Acordo fechado",
  sem_acordo: "Conversa encerrada sem acordo",
  sobrecarga_aceita: "Você cedeu sem negociar",
};

// ---------- cenário (vem do servidor) ----------
let cenarios: InfoCenario[] = [];
let cenario: InfoCenario = {
  id: cenarioId, ordem: 1, titulo: "", personagem: { nome: "", papel: "" }, situacao: "", meta: "", maxTrocas: 8,
};
let retrato = "";
const nome = () => cenario.personagem.nome;
const proximoCenario = () => cenarios.find((c) => c.ordem === cenario.ordem + 1);

const barra = (titulo: string, numero: number) => `
  <header class="barra"><span>Conversas Difíceis em TI · ${esc(titulo)}</span><span>Tela ${numero} de 8</span></header>`;

// ---------- telas ----------
function render(): void {
  const telas: Record<Tela, () => string> = {
    briefing: telaBriefing,
    dialogo: telaDialogo,
    encerrada: telaDialogo,
    relatorio: telaRelatorio,
    reflexao: telaReflexao,
  };
  app.innerHTML = telas[estado.tela]();
  ligarEventos();
}

function telaBriefing(): string {
  return `${barra(`Cenário ${cenario.ordem}`, 2)}
  <section class="cartao">
    <h1>Cenário ${cenario.ordem} · ${esc(cenario.titulo)}</h1>
    <p>${esc(cenario.situacao)} <strong>Sua meta:</strong> ${esc(cenario.meta.charAt(0).toLowerCase() + cenario.meta.slice(1))}</p>
    <ul class="chips" aria-label="Sobre o cenário">
      <li>Cerca de 15 min</li><li>Responda por texto</li><li>Pode pausar</li>
    </ul>
    <p class="discreto">A IA analisa a conversa só para gerar o seu relatório.<br>
    Sua liderança não vê o resultado individual.${microfoneDisponivel ? `<br>
    Se usar o microfone, o navegador envia sua voz para virar texto (no Chrome, ao Google). Nada é gravado.` : ""}</p>
    ${estado.erro ? `<p class="erro" role="alert">${esc(estado.erro)}</p>` : ""}
    <div class="acoes">
      <button class="primario" data-acao="comecar" ${estado.aguardando ? "disabled" : ""}>
        ${estado.aguardando ? "Abrindo…" : "Começar"}</button>
      <button data-acao="ficha">Ler a ficha antes</button>
    </div>
  </section>`;
}

function telaDialogo(): string {
  const encerrada = estado.tela === "encerrada";
  const falas = estado.falas
    .map((f, i) =>
      f.autor === "personagem"
        ? `<div class="fala marina"><span class="quem">${esc(nome())}${estado.voz
            ? ` <button class="ouvir" data-ouvir="${i}" aria-label="Ouvir esta fala de ${esc(nome())}">🔊</button>` : ""}</span><p>${esc(f.texto)}</p></div>`
        : `<div class="fala voce"><span class="quem">Você</span><p>${esc(f.texto)}</p></div>`,
    )
    .join("");
  const rodape = encerrada
    ? `<div class="aviso">Conversa encerrada em ${estado.troca} ${estado.troca === 1 ? "fala" : "falas"}.</div>
       ${estado.erro ? `<p class="erro" role="alert">${esc(estado.erro)}</p>` : ""}
       <div class="acoes"><button class="primario" data-acao="relatorio" ${estado.aguardando ? "disabled" : ""}>
         ${estado.aguardando ? "Gerando seu relatório…" : "Ver meu relatório"}</button></div>`
    : `<p class="discreto" id="instrucao">Responda por texto · fala ${estado.troca + 1} de até ${estado.maxTrocas}</p>
       ${estado.erro ? `<p class="erro" role="alert">${esc(estado.erro)} <button data-acao="reenviar">Tentar de novo</button></p>` : ""}
       ${estado.ouvindo ? `<p class="discreto" role="status">Ouvindo… fale e depois confira o texto antes de enviar.</p>` : ""}
       ${estado.avisoMic ? `<p class="erro" role="alert">${esc(estado.avisoMic)}</p>` : ""}
       <form class="resposta" data-form="fala">
         <label class="sr" for="campo">Sua resposta</label>
         <textarea id="campo" rows="2" maxlength="1000" placeholder="Digite sua resposta…" aria-describedby="instrucao"
           ${estado.aguardando ? "disabled" : ""}>${esc(estado.textoPendente)}</textarea>
         ${microfoneDisponivel ? `<button type="button" data-acao="microfone" aria-pressed="${estado.ouvindo}"
           ${estado.aguardando ? "disabled" : ""}>${estado.ouvindo ? "■ Parar" : "🎤 Falar"}</button>` : ""}
         <button class="primario" type="submit" ${estado.aguardando ? "disabled" : ""}>Enviar</button>
       </form>
       <div class="acoes"><button data-acao="pausar">II Pausar</button><button data-acao="ficha">Ver ficha</button>
         ${botaoVoz()}</div>`;
  return `${barra(`Cenário ${cenario.ordem}`, encerrada ? 6 : 3)}
  <section class="dialogo">
    <div class="personagem" aria-hidden="true"><div class="retrato">${retrato}</div><div><strong>${esc(nome())}</strong><br><span>${esc(cenario.personagem.papel)}</span></div></div>
    <div class="conversa">
      <div class="falas" id="falas">${falas}
        ${estado.aguardando && !encerrada ? `<p class="digitando" role="status">${esc(nome())} está digitando…</p>` : ""}</div>
      ${rodape}
    </div>
  </section>`;
}

function botaoVoz(): string {
  if (!estado.voz) return "";
  return `<button data-acao="voz" aria-pressed="${estado.vozLigada}">${
    estado.vozLigada ? `🔊 Voz de ${esc(nome())}: ligada` : `🔇 Voz de ${esc(nome())}: desligada`}</button>`;
}

function telaRelatorio(): string {
  const r = estado.relatorio!;
  const resumo = `
    <dl class="niveis">${r.criterios
      .map((c) => {
        const n = NIVEIS[c.nivel];
        return `<div class="nivel"><dt>${NOMES[c.nome]}</dt>
          <dd><span class="medidor" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n.passos ? "cheio" : ""}"></i>`).join("")}</span>
          <span>${n.texto}</span></dd></div>`;
      })
      .join("")}</dl>
    <div class="cards">
      <article class="card bom"><h2>Ponto forte</h2><p>${esc(r.ponto_forte.comentario)}</p>
        <blockquote>“${esc(r.ponto_forte.trecho)}”</blockquote></article>
      <article class="card"><h2>Para treinar: ${NOMES[r.para_treinar.criterio].toLowerCase()}</h2>
        <p class="discreto">Você disse: “${esc(r.para_treinar.voce_disse)}”</p>
        <p><strong>Tente:</strong> “${esc(r.para_treinar.tente)}”</p></article>
    </div>`;
  const citadas = new Set(r.criterios.map((c) => c.evidencia.trim()));
  const porQue = `<h2>Por que cada nível</h2>
    <ul class="motivos">${r.criterios
      .map((c) => `<li><strong>${NOMES[c.nome]}: ${NIVEIS[c.nivel].texto.toLowerCase()}.</strong>
        ${c.motivo ? esc(c.motivo) : ""}
        <span class="discreto">Você disse: “${esc(c.evidencia)}”</span></li>`)
      .join("")}</ul>`;
  const detalhe = `${porQue}<h2>A conversa</h2><ol class="transcricao">${estado.falas
    .map((f) => {
      const destaque = f.autor === "jogador" && citadas.has(f.texto.trim());
      return `<li class="t-${f.autor}"><span class="quem">${f.autor === "jogador" ? "Você" : esc(nome())}</span>
        ${destaque ? `<mark>${esc(f.texto)}</mark>` : esc(f.texto)}</li>`;
    })
    .join("")}</ol>
    <p class="discreto">Trechos destacados foram usados na avaliação.</p>
    <p class="discreto base">A rubrica se baseia no roteiro DESC de assertividade (Bower e Bower, 1976),
      na escuta ativa (Rogers e Farson, 1957; Bodie, 2011), na negociação por interesses
      (Fisher e Ury, 1981) e nos modos de lidar com conflito (Thomas e Kilmann, 1974).</p>`;
  return `${barra("Relatório da conversa", 7)}
  <section class="relatorio">
    <p class="discreto meta-relatorio"><strong>Sua meta era:</strong> ${esc(cenario.meta.charAt(0).toLowerCase() + cenario.meta.slice(1))}</p>
    <p class="resultado">${RESULTADOS[r.resultado]}</p>
    <div role="tablist" class="abas">
      <button role="tab" aria-selected="${estado.aba === "resumo"}" data-aba="resumo">Resumo</button>
      <button role="tab" aria-selected="${estado.aba === "detalhe"}" data-aba="detalhe">Detalhe</button>
    </div>
    <div role="tabpanel">${estado.aba === "resumo" ? resumo : detalhe}</div>
    <p class="discreto">Níveis: a melhorar, adequado, bom.</p>
    <div class="acoes"><button class="primario" data-acao="continuar">Continuar</button></div>
  </section>`;
}

function telaReflexao(): string {
  const r = estado.relatorio!;
  return `${barra(`Cenário ${cenario.ordem}`, 8)}
  <section class="reflexao">
    <h1>Cenário ${cenario.ordem} concluído</h1>
    <p class="discreto">Seu progresso por habilidade</p>
    <dl class="niveis">${r.criterios
      .map((c) => {
        const n = NIVEIS[c.nivel];
        return `<div class="nivel"><dt>${NOMES[c.nome]}</dt><dd><span class="medidor" aria-hidden="true">${[1, 2, 3]
          .map((i) => `<i class="${i <= n.passos ? "cheio" : ""}"></i>`)
          .join("")}</span><span>${n.texto}</span></dd></div>`;
      })
      .join("")}</dl>
    <div class="card">
      <h2><label for="reflexao">Pense na prática</label></h2>
      <p>Em que reunião real desta semana você pode usar fato, impacto e proposta?</p>
      <textarea id="reflexao" rows="2" placeholder="Escreva uma linha (opcional)">${esc(lerLocal("cd-reflexao"))}</textarea>
      <p class="discreto">Fica só neste navegador; não vai para a IA.</p>
    </div>
    <div class="acoes">
      <button data-acao="repetir">Repetir cenário</button>
      ${proximoCenario()
        ? `<button class="primario" data-acao="proximo">Próximo: Cenário ${proximoCenario()!.ordem}</button>`
        : `<button class="primario" data-acao="proximo">Voltar ao escritório</button>`}
    </div>
    <p class="discreto">Sem pontos nem ranking: só o progresso por habilidade. Para sair, deixe a sala no mapa.</p>
  </section>`;
}

function renderFicha(pausa: boolean): void {
  ficha.innerHTML = `
    <p class="discreto">${pausa ? "Pausado · ficha rápida" : "Ficha rápida"}</p>
    <h2 id="ficha-titulo">Assertividade em 3 passos</h2>
    <ol class="passos">
      <li><strong>Fato</strong><span>O que está acontecendo, sem julgamento</span></li>
      <li><strong>Impacto</strong><span>O que muda para a equipe ou para a entrega</span></li>
      <li><strong>Proposta</strong><span>Uma alternativa concreta para combinar</span></li>
    </ol>
    <p>Exemplo: “Com o login, a demo de sexta atrasa. Posso entregar na próxima sprint?”</p>
    <form method="dialog"><button class="primario">${pausa ? "Voltar à conversa" : "Fechar"}</button></form>`;
  ficha.showModal();
}

// ---------- ações ----------
async function comecar(): Promise<void> {
  estado.aguardando = true; estado.erro = ""; render();
  try {
    const s = await api.iniciar(jogadorId, cenario.id);
    Object.assign(estado, {
      sessaoId: s.sessaoId, maxTrocas: s.maxTrocas, troca: 0, voz: s.voz === true,
      falas: [{ autor: "personagem", texto: s.abertura }], tela: "dialogo", relatorio: undefined, aba: "resumo",
    });
  } catch (e) {
    estado.erro = e instanceof ApiError ? e.message : "Algo deu errado.";
  }
  estado.aguardando = false; render(); focarCampo();
  if (estado.tela === "dialogo") falarPersonagem(0);
}

/** Toca a fala n da personagem, se a voz estiver ligada. */
function falarPersonagem(n: number, mesmoDesligada = false): void {
  if (!estado.voz || (!estado.vozLigada && !mesmoDesligada)) return;
  tocar(api.urlVoz(estado.sessaoId, n));
}

function alternarMicrofone(): void {
  if (escuta) { escuta.parar(); return; }
  const antes = estado.textoPendente.trim();
  estado.avisoMic = "";
  escuta = ouvir(
    (texto) => {
      const campo = document.querySelector<HTMLTextAreaElement>("#campo");
      const valor = antes ? `${antes} ${texto}` : texto;
      estado.textoPendente = valor;
      if (campo) campo.value = valor;
    },
    (erro) => {
      escuta = undefined;
      estado.ouvindo = false;
      estado.avisoMic = erro ?? "";
      render(); focarCampo();
    },
  );
  estado.ouvindo = Boolean(escuta);
  render();
}

async function enviar(texto: string): Promise<void> {
  if (!texto.trim() || estado.aguardando) return;
  escuta?.parar();
  pararVoz();
  estado.textoPendente = texto; estado.aguardando = true; estado.erro = "";
  estado.falas.push({ autor: "jogador", texto });
  render();
  try {
    const r = await api.falar(estado.sessaoId, texto);
    estado.falas.push({ autor: "personagem", texto: r.resposta });
    estado.troca = r.troca; estado.textoPendente = "";
    if (r.encerrada) estado.tela = "encerrada";
    falarPersonagem(estado.falas.length - 1);
  } catch (e) {
    estado.falas.pop(); // a fala não chegou: devolve para o campo
    estado.erro = e instanceof ApiError ? e.message : "Algo deu errado.";
  }
  estado.aguardando = false; render(); focarCampo();
}

async function pedirRelatorio(): Promise<void> {
  pararVoz();
  estado.aguardando = true; estado.erro = ""; render();
  try {
    const r = await api.relatorio(estado.sessaoId);
    estado.relatorio = r.relatorio; estado.falas = r.falas; estado.tela = "relatorio";
  } catch (e) {
    estado.erro = e instanceof ApiError ? e.message : "Algo deu errado.";
  }
  estado.aguardando = false; render();
}

function focarCampo(): void {
  document.querySelector<HTMLTextAreaElement>("#campo")?.focus();
  const lista = document.querySelector("#falas");
  lista?.scrollTo({ top: lista.scrollHeight });
}

function ligarEventos(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-acao]").forEach((b) =>
    b.addEventListener("click", () => {
      const acao = b.dataset.acao;
      if (acao === "comecar" || acao === "repetir") void comecar();
      if (acao === "proximo") irParaProximo();
      if (acao === "ficha") renderFicha(false);
      if (acao === "pausar") { pararVoz(); escuta?.parar(); renderFicha(true); }
      if (acao === "microfone") alternarMicrofone();
      if (acao === "voz") {
        estado.vozLigada = !estado.vozLigada;
        salvarLocal("cd-voz", estado.vozLigada ? "ligada" : "desligada");
        if (!estado.vozLigada) pararVoz();
        render();
      }
      if (acao === "relatorio") void pedirRelatorio();
      if (acao === "reenviar") void enviar(estado.textoPendente);
      if (acao === "continuar") { estado.tela = "reflexao"; render(); }
    }),
  );
  app.querySelectorAll<HTMLButtonElement>("[data-ouvir]").forEach((b) =>
    b.addEventListener("click", () => falarPersonagem(Number(b.dataset.ouvir), true)),
  );
  app.querySelectorAll<HTMLButtonElement>("[data-aba]").forEach((b) =>
    b.addEventListener("click", () => { estado.aba = b.dataset.aba as "resumo" | "detalhe"; render(); }),
  );
  const form = app.querySelector<HTMLFormElement>("[data-form=fala]");
  const campo = app.querySelector<HTMLTextAreaElement>("#campo");
  form?.addEventListener("submit", (ev) => { ev.preventDefault(); void enviar(campo?.value ?? ""); });
  campo?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); form?.requestSubmit(); }
  });
  campo?.addEventListener("input", () => { estado.textoPendente = campo.value; });
  app.querySelector<HTMLTextAreaElement>("#reflexao")?.addEventListener("input", (ev) =>
    salvarLocal("cd-reflexao", (ev.target as HTMLTextAreaElement).value),
  );
}

/** Depois do último relatório: no escritório, o jogo aponta a próxima pessoa; fora dele, abre o próximo cenário. */
function irParaProximo(): void {
  const prox = proximoCenario();
  if (window.parent !== window) {
    window.parent.postMessage({ tipo: "proximo", cenario: prox?.id ?? "" }, location.origin);
    return;
  }
  if (prox) {
    const url = new URL(location.href);
    url.searchParams.set("cenario", prox.id);
    location.href = url.href;
  }
}

async function iniciar(): Promise<void> {
  try {
    cenarios = (await api.cenarios()).cenarios;
    cenario = cenarios.find((c) => c.id === cenarioId) ?? cenarios[0] ?? cenario;
    estado.maxTrocas = cenario.maxTrocas;
  } catch (e) {
    estado.erro = e instanceof Error ? e.message : "O servidor não respondeu.";
  }
  retrato = await retratoDe(cenario.id);
  render();
}
void iniciar();

// Aberto dentro do escritório (modal do jogo): Esc pede para fechar a conversa,
// a menos que a ficha esteja aberta (aí o Esc fecha só a ficha).
if (window.parent !== window) {
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || document.querySelector("dialog[open]")) return;
    window.parent.postMessage({ tipo: "fechar-conversa" }, location.origin);
  });
}
