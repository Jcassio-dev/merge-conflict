import "../style.css";
import "./jogo.css";
import { retratoMarina } from "../retrato";
import { caminho, type Tile } from "./caminho";
import {
  CORES_CABELO, DIRECOES, OPCIONAL, PARTES, ROTULO, TOTAL,
  aparenciaAleatoria, aparenciaValida, carregarPecas, folhaDoBoneco, quadroDoPasso, type Aparencia, type Parte,
} from "./boneco";
import { CAMADA_BALAO, Mapa } from "./mapa";
import { Rede, urlSala, type Direcao, type Outro } from "./rede";

// O escritório: mapa do Tiled, movimento, outros jogadores (só posição e apelido)
// e a Marina. A conversa abre ao lado, no painel (conversa.html), num iframe.

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const BASE = import.meta.env.BASE_URL;
const CENARIO = "cenario-1";
const ZONA_MARINA = "marina";
const SALA = "sala-projeto";
const VELOCIDADE = 140; // pixels do mapa por segundo
const TECLAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

// ---------- preferências no navegador ----------
function ler(chave: string): string {
  try { return localStorage.getItem(chave) ?? ""; } catch { return ""; }
}
function salvar(chave: string, valor: string): void {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento: ignora */ }
}
function idJogador(): string {
  const salvo = ler("cd-jogador");
  if (salvo) return salvo;
  const novo = crypto.randomUUID();
  salvar("cd-jogador", novo);
  return novo;
}

// ---------- elementos ----------
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const tela = $<HTMLCanvasElement>("#tela");
const ctx = tela.getContext("2d")!;
const palco = $<HTMLElement>("#palco");
const aviso = $<HTMLElement>("#aviso");
const contador = $<HTMLElement>("#contador");
const cartaoBoasVindas = $<HTMLElement>("#boas-vindas");
const cartaoMarina = $<HTMLElement>("#cartao-marina");
const painel = $<HTMLDialogElement>("#painel");
const entrada = $<HTMLDialogElement>("#entrada");

// ---------- estado ----------
type Boneco = { nome: string; aparencia: Aparencia; x: number; y: number; dir: Direcao; andando: boolean; passo: number };
const jogadorId = idJogador();
const eu: Boneco = { nome: "", aparencia: aparenciaValida(undefined), x: 0, y: 0, dir: "baixo", andando: false, passo: 0 };
const outros = new Map<string, Boneco & { alvoX: number; alvoY: number }>();
const teclas = new Set<string>();
let rota: Tile[] = [];
let areasAtuais = new Set<string>();
let painelAberto = false;
let boasVindasFechado = false;
let concluiu = false;
let mapa: Mapa;
let camera = { x: 0, y: 0, zoom: 1, dpr: 1 };

// ---------- início ----------
void iniciar();

async function iniciar(): Promise<void> {
  try {
    [mapa] = await Promise.all([Mapa.carregar(`${BASE}mapa/escritorio.tmj`), carregarPecas(BASE)]);
    eu.aparencia = aparenciaValida(eu.aparencia);
  } catch (e) {
    console.error(e);
    aviso.textContent = "O escritório não carregou. Recarregue a página.";
    return;
  }
  eu.x = mapa.inicio.x;
  eu.y = mapa.inicio.y;
  ajustarTela();
  new ResizeObserver(ajustarTela).observe(palco);
  requestAnimationFrame(quadro);

  concluiu = await concluiuCenario();
  if (concluiu) mapa.ocultarCamada(CAMADA_BALAO);

  const apelido = ler("cd-apelido");
  if (apelido) entrar(apelido, aparenciaSalva() ?? aparenciaAleatoria());
  else abrirEntrada();
}

function aparenciaSalva(): Aparencia | undefined {
  try {
    const bruta = ler("cd-aparencia");
    return bruta ? aparenciaValida(JSON.parse(bruta)) : undefined;
  } catch {
    return undefined;
  }
}

function entrar(nome: string, aparencia: Aparencia): void {
  eu.nome = nome;
  eu.aparencia = aparencia;
  const primeiraVez = !rede;
  if (primeiraVez) {
    rede = new Rede(urlSala(API), () => ({ nome: eu.nome, aparencia: eu.aparencia, x: eu.x, y: eu.y, dir: eu.dir }), {
      bemvindo: (_id, lista) => {
        outros.clear();
        lista.forEach(adicionarOutro);
        atualizarContador();
      },
      entrou: (o) => {
        adicionarOutro(o);
        atualizarContador();
      },
      moveu: (m) => {
        const o = outros.get(m.id);
        if (!o) return;
        Object.assign(o, { alvoX: m.x, alvoY: m.y, dir: m.dir, andando: m.andando });
      },
      saiu: (id) => {
        outros.delete(id);
        atualizarContador();
      },
      caiu: () => {
        outros.clear();
        atualizarContador();
      },
    });
    rede.conectar();
    if (!concluiu) mostrarBoasVindas();
  } else {
    // Mudou o apelido ou o boneco: reconecta para os outros verem.
    rede?.reiniciar();
  }
  tela.focus();
}
let rede: Rede | undefined;

function adicionarOutro(o: Outro): void {
  outros.set(o.id, { ...o, passo: 0, alvoX: o.x, alvoY: o.y });
}

function atualizarContador(): void {
  const n = outros.size + 1;
  contador.textContent = n === 1 ? "Só você no escritório" : `${n} pessoas no escritório`;
}

// ---------- apelido e boneco ----------
const formEntrada = entrada.querySelector("form")!;
const previa = entrada.querySelector<HTMLCanvasElement>("#previa")!;
const abas = entrada.querySelector<HTMLElement>(".abas")!;
const grade = entrada.querySelector<HTMLElement>(".grade")!;
const coresCabelo = entrada.querySelector<HTMLElement>(".cores-cabelo")!;
let escolha: Aparencia = aparenciaValida(undefined);
let parteAtual: Parte = "corpo";
let previaTimer: ReturnType<typeof setInterval> | undefined;

/** Miniatura de frente (quadro parado) de uma aparência. */
function miniatura(a: Aparencia, tamanho: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = tamanho;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.drawImage(folhaDoBoneco(a), 32, 0, 32, 32, 0, 0, tamanho, tamanho);
  return c;
}

/** Prévia ampliada que gira pelas 4 direções andando. */
function animarPrevia(): void {
  const c = previa.getContext("2d")!;
  let passo = 0;
  clearInterval(previaTimer);
  const desenhar = () => {
    const d = Math.floor(passo / 8) % 4;
    const q = [0, 1, 2, 1][passo % 4]!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, previa.width, previa.height);
    c.drawImage(folhaDoBoneco(escolha), q * 32, d * 32, 32, 32, 0, 0, previa.width, previa.height);
    passo++;
  };
  desenhar();
  previaTimer = setInterval(desenhar, 160);
}

/** Abas das partes do boneco. */
function montarAbas(): void {
  abas.innerHTML = "";
  for (const p of PARTES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aba";
    b.textContent = ROTULO[p];
    b.setAttribute("aria-pressed", String(p === parteAtual));
    b.addEventListener("click", () => {
      parteAtual = p;
      montarAbas();
      montarGrade();
    });
    abas.append(b);
  }
}

/** Grade com as opções da parte escolhida, cada uma já vestida no seu boneco. */
function montarGrade(): void {
  coresCabelo.hidden = parteAtual !== "cabelo";
  marcarCorCabelo();
  grade.innerHTML = "";
  grade.setAttribute("aria-label", ROTULO[parteAtual]);
  const opcoes = [...(OPCIONAL[parteAtual] ? [-1] : []), ...Array.from({ length: TOTAL[parteAtual] }, (_, i) => i)];
  for (const i of opcoes) {
    const rotulo = document.createElement("label");
    rotulo.className = "peca";
    const nome = i < 0 ? "Nenhum" : `${ROTULO[parteAtual]} ${i + 1}`;
    rotulo.title = nome;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "peca";
    input.value = String(i);
    input.checked = escolha[parteAtual] === i;
    input.setAttribute("aria-label", nome);
    input.addEventListener("change", () => {
      escolha = { ...escolha, [parteAtual]: i };
      animarPrevia();
    });
    const mini = miniatura({ ...escolha, [parteAtual]: i }, 64);
    mini.dataset.opcao = String(i);
    rotulo.append(input, mini);
    if (i < 0) rotulo.insertAdjacentHTML("beforeend", `<span class="nenhum" aria-hidden="true">Nenhum</span>`);
    grade.append(rotulo);
  }
}

let gradeTimer: ReturnType<typeof setTimeout> | undefined;

/** Redesenha as miniaturas que já estão na tela, sem recriar a lista. */
function redesenharGrade(): void {
  for (const c of grade.querySelectorAll<HTMLCanvasElement>("canvas[data-opcao]")) {
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(miniatura({ ...escolha, [parteAtual]: Number(c.dataset.opcao) }, c.width), 0, 0);
  }
}

/** Cores do cabelo: as prontas e um seletor para qualquer outra. */
function montarCoresCabelo(): void {
  const lista = coresCabelo.querySelector(".amostras")!;
  for (const { nome, cor } of CORES_CABELO) {
    const rotulo = document.createElement("label");
    rotulo.className = "amostra";
    rotulo.title = nome;
    rotulo.innerHTML = `<input type="radio" name="cor-cabelo" value="${cor}" aria-label="${nome}"><span style="background:${cor}" aria-hidden="true"></span>`;
    lista.append(rotulo);
  }
  // A prévia muda na hora (ela se redesenha sozinha a cada quadro da animação);
  // as miniaturas esperam a pessoa parar de arrastar o seletor de cor.
  const trocar = (cor: string) => {
    escolha = { ...escolha, corCabelo: cor };
    marcarCorCabelo();
    clearTimeout(gradeTimer);
    gradeTimer = setTimeout(redesenharGrade, 200);
  };
  lista.addEventListener("change", (e) => trocar((e.target as HTMLInputElement).value));
  coresCabelo.querySelector<HTMLInputElement>("input[type=color]")!.addEventListener("input", (e) => trocar((e.target as HTMLInputElement).value));
}

function marcarCorCabelo(): void {
  let pronta = false;
  for (const i of coresCabelo.querySelectorAll<HTMLInputElement>("input[name=cor-cabelo]")) {
    i.checked = i.value === escolha.corCabelo;
    pronta ||= i.checked;
  }
  const livre = coresCabelo.querySelector<HTMLInputElement>("input[type=color]")!;
  livre.value = escolha.corCabelo;
  livre.closest("label")!.classList.toggle("marcada", !pronta);
}

function abrirEntrada(): void {
  const campo = formEntrada.querySelector<HTMLInputElement>("input[name=apelido]")!;
  campo.value = eu.nome || ler("cd-apelido");
  escolha = eu.nome ? eu.aparencia : (aparenciaSalva() ?? aparenciaAleatoria());
  montarAbas();
  montarGrade();
  entrada.showModal();
  animarPrevia();
  campo.focus();
}

function montarEntrada(): void {
  montarCoresCabelo();
  formEntrada.querySelector("#sortear")!.addEventListener("click", () => {
    escolha = aparenciaAleatoria();
    montarGrade();
    animarPrevia();
  });
  formEntrada.addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = new FormData(formEntrada);
    const nome = String(dados.get("apelido") ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
    // Sem apelido: "Visitante 42", para não ficar todo mundo com o mesmo nome.
    const final = nome || `Visitante ${10 + Math.floor(Math.random() * 90)}`;
    salvar("cd-apelido", final);
    salvar("cd-aparencia", JSON.stringify(escolha));
    entrada.close();
    entrar(final, escolha);
  });
  entrada.addEventListener("close", () => clearInterval(previaTimer));
  // Fechar com Esc: na primeira vez entra assim mesmo; depois, só desiste da mudança.
  entrada.addEventListener("cancel", (e) => {
    if (!eu.nome) {
      e.preventDefault();
      formEntrada.requestSubmit();
    }
  });
}
montarEntrada();
$("#meu-boneco").addEventListener("click", abrirEntrada);

// ---------- progresso ----------
async function concluiuCenario(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/progresso/${encodeURIComponent(jogadorId)}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const dados = (await res.json()) as { progresso?: Record<string, { concluido?: boolean }> };
    return dados.progresso?.[CENARIO]?.concluido === true;
  } catch {
    return false;
  }
}

// ---------- cartões ----------
function mostrarBoasVindas(): void {
  if (boasVindasFechado) return;
  cartaoBoasVindas.hidden = false;
}
function fecharBoasVindas(): void {
  boasVindasFechado = true;
  cartaoBoasVindas.hidden = true;
}
cartaoBoasVindas.querySelector("button")!.addEventListener("click", () => {
  fecharBoasVindas();
  tela.focus();
});

cartaoMarina.querySelector(".retrato")!.innerHTML = retratoMarina();
cartaoMarina.querySelector("button")!.addEventListener("click", abrirPainel);

function mostrarConvite(): void {
  cartaoMarina.querySelector("button")!.textContent = concluiu ? "Conversar de novo" : "Conversar com a Marina";
  cartaoMarina.hidden = false;
  aviso.textContent = "Você está perto da Marina. Aperte ESPAÇO ou use o botão para conversar.";
}
function esconderConvite(): void {
  cartaoMarina.hidden = true;
}

// ---------- painel da conversa ----------
function abrirPainel(): void {
  if (painelAberto) return;
  painelAberto = true;
  esconderConvite();
  rota = [];
  teclas.clear();
  const url = new URL(`${BASE}conversa.html`, location.href);
  url.searchParams.set("cenario", CENARIO);
  url.searchParams.set("jogador", jogadorId);
  const quadro = painel.querySelector("iframe")!;
  quadro.src = url.href;
  painel.showModal();
  quadro.focus();
}

async function fecharPainel(): Promise<void> {
  if (!painelAberto) return;
  painelAberto = false;
  if (painel.open) painel.close();
  painel.querySelector("iframe")!.src = "about:blank";
  tela.focus();
  // Pode ter concluído agora: o balão "…" some e o botão vira "Conversar de novo".
  if (!concluiu && (await concluiuCenario())) {
    concluiu = true;
    mapa.ocultarCamada(CAMADA_BALAO);
  }
  if (areasAtuais.has(ZONA_MARINA)) mostrarConvite();
}
$("#fechar-painel").addEventListener("click", () => void fecharPainel());
// Esc fecha o modal pelo navegador; aqui o jogo arruma o resto.
painel.addEventListener("close", () => void fecharPainel());
// Esc apertado dentro da conversa (iframe do mesmo site).
window.addEventListener("message", (e) => {
  if (e.origin === location.origin && (e.data as { tipo?: string } | null)?.tipo === "fechar-conversa") void fecharPainel();
});

$("#ir-marina").addEventListener("click", () => {
  const zona = mapa?.areas.find((a) => a.nome === ZONA_MARINA);
  if (!zona) return;
  irPara(Math.floor((zona.x + zona.w / 2) / mapa.tile), Math.floor((zona.y + zona.h - 1) / mapa.tile));
  tela.focus();
});

// ---------- entrada do jogador ----------
window.addEventListener("keydown", (e) => {
  if (entrada.open || painel.open || e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
  if (e.code in TECLAS) {
    teclas.add(e.code);
    rota = [];
    e.preventDefault();
  } else if (e.code === "Space" && areasAtuais.has(ZONA_MARINA) && !painelAberto) {
    e.preventDefault();
    abrirPainel();
  }
});
window.addEventListener("keyup", (e) => teclas.delete(e.code));
window.addEventListener("blur", () => teclas.clear());

tela.addEventListener("pointerdown", (e) => {
  if (!mapa) return;
  const r = tela.getBoundingClientRect();
  const wx = ((e.clientX - r.left) * camera.dpr) / camera.zoom + camera.x;
  const wy = ((e.clientY - r.top) * camera.dpr) / camera.zoom + camera.y;
  irPara(Math.floor(wx / mapa.tile), Math.floor(wy / mapa.tile));
  tela.focus();
});

function irPara(tx: number, ty: number): void {
  rota = caminho((x, y) => mapa.livre(x, y), tileDe(eu.x, eu.y), { x: tx, y: ty });
}

function tileDe(x: number, y: number): Tile {
  return { x: Math.floor(x / mapa.tile), y: Math.floor((y - 4) / mapa.tile) };
}

// ---------- movimento e colisão ----------
/** Os pés ocupam uma caixa de 14 x 6 px; todos os cantos precisam estar em tiles livres. */
function cabe(x: number, y: number): boolean {
  const t = mapa.tile;
  for (const [px, py] of [[x - 7, y - 7], [x + 7, y - 7], [x - 7, y - 1], [x + 7, y - 1]] as const) {
    if (!mapa.livre(Math.floor(px / t), Math.floor(py / t))) return false;
  }
  return true;
}

function mover(dt: number): void {
  let dx = 0;
  let dy = 0;
  for (const k of teclas) {
    const v = TECLAS[k];
    if (v) { dx += v[0]; dy += v[1]; }
  }
  if (!dx && !dy && rota.length) {
    const alvo = rota[0]!;
    const ax = alvo.x * mapa.tile + mapa.tile / 2;
    const ay = alvo.y * mapa.tile + mapa.tile / 2 + 8;
    const ddx = ax - eu.x;
    const ddy = ay - eu.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 2) {
      eu.x = ax;
      eu.y = ay;
      rota.shift();
    } else {
      dx = ddx / dist;
      dy = ddy / dist;
    }
  }
  const andando = dx !== 0 || dy !== 0;
  if (andando) {
    const len = Math.hypot(dx, dy);
    const passo = (VELOCIDADE * dt) / len;
    const nx = eu.x + dx * passo;
    const ny = eu.y + dy * passo;
    // Desliza na parede: tenta os dois eixos separados.
    if (cabe(nx, eu.y)) eu.x = nx;
    if (cabe(eu.x, ny)) eu.y = ny;
    if (Math.abs(dx) > Math.abs(dy)) eu.dir = dx > 0 ? "direita" : "esquerda";
    else eu.dir = dy > 0 ? "baixo" : "cima";
    eu.passo += dt;
  } else {
    eu.passo = 0;
  }
  eu.andando = andando;
  rede?.mover(eu.x, eu.y, eu.dir, andando);
  verificarAreas();
}

function verificarAreas(): void {
  const agora = new Set(mapa.areasEm(eu.x, eu.y - 4));
  const entrou = (n: string) => agora.has(n) && !areasAtuais.has(n);
  const saiu = (n: string) => !agora.has(n) && areasAtuais.has(n);
  if (entrou(SALA)) fecharBoasVindas();
  if (entrou(ZONA_MARINA)) mostrarConvite();
  if (saiu(ZONA_MARINA)) {
    esconderConvite();
    aviso.textContent = "";
    void fecharPainel();
  }
  areasAtuais = agora;
}

// ---------- desenho ----------
function ajustarTela(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = palco.clientWidth;
  const h = palco.clientHeight;
  tela.width = Math.round(w * dpr);
  tela.height = Math.round(h * dpr);
  // Zoom inteiro (pixel art nítida) que mostre umas 12 linhas de tiles na altura.
  const desejado = Math.min(h / (12 * 32), w / (14 * 32));
  camera.zoom = Math.max(1, Math.round(Math.min(Math.max(desejado, 1), 3) * dpr));
  camera.dpr = dpr;
}

function posicionarCamera(): void {
  const vw = tela.width / camera.zoom;
  const vh = tela.height / camera.zoom;
  const centro = (pos: number, vista: number, total: number) =>
    total <= vista ? (total - vista) / 2 : Math.min(Math.max(pos - vista / 2, 0), total - vista);
  camera.x = Math.round(centro(eu.x, vw, mapa.larguraPx) * camera.zoom) / camera.zoom;
  camera.y = Math.round(centro(eu.y - 16, vh, mapa.alturaPx) * camera.zoom) / camera.zoom;
}

function desenharBoneco(b: Boneco): void {
  const t = 32;
  const quadro = quadroDoPasso(b.andando, b.passo);
  const linha = DIRECOES.indexOf(b.dir);
  ctx.drawImage(folhaDoBoneco(b.aparencia), quadro * t, linha * t, t, t, Math.round(b.x - 16), Math.round(b.y - 30), t, t);
}

function desenharNome(b: Boneco, destaque: boolean): void {
  const dpr = camera.dpr;
  const sx = (b.x - camera.x) * camera.zoom;
  const sy = (b.y - 32 - camera.y) * camera.zoom;
  ctx.font = `700 ${Math.round(12 * dpr)}px Nunito, system-ui, sans-serif`;
  const w = ctx.measureText(b.nome).width + 10 * dpr;
  const h = 18 * dpr;
  ctx.fillStyle = destaque ? "#3f6b31" : "rgba(59, 42, 30, 0.85)";
  ctx.beginPath();
  ctx.roundRect(sx - w / 2, sy - h - 2 * dpr, w, h, 4 * dpr);
  ctx.fill();
  ctx.fillStyle = "#fffaf0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(b.nome, sx, sy - h / 2 - 2 * dpr);
}

let anterior = performance.now();
function quadro(agora: number): void {
  const dt = Math.min((agora - anterior) / 1000, 0.1);
  anterior = agora;
  if (eu.nome && !entrada.open && !painel.open) mover(dt);

  // Os outros deslizam até a última posição recebida.
  for (const o of outros.values()) {
    const k = 1 - Math.exp(-dt * 12);
    o.x += (o.alvoX - o.x) * k;
    o.y += (o.alvoY - o.y) * k;
    o.passo = o.andando ? o.passo + dt : 0;
  }

  posicionarCamera();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#2b2233";
  ctx.fillRect(0, 0, tela.width, tela.height);
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, -camera.x * camera.zoom, -camera.y * camera.zoom);
  mapa.desenharAbaixo(ctx, agora);
  const todos = [...outros.values(), ...(eu.nome ? [eu] : [])].sort((a, b) => a.y - b.y);
  todos.forEach(desenharBoneco);
  mapa.desenharAcima(ctx, agora);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const o of outros.values()) desenharNome(o, false);
  if (eu.nome) desenharNome(eu, true);
  requestAnimationFrame(quadro);
}
