import "./style.css";
import { retratoMarina } from "./retrato";
import { api, ApiError, type Fala, type Nivel, type NomeCriterio, type Relatorio } from "./api";

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
};

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
  sobrecarga_aceita: "Você aceitou a mudança sem negociar",
};

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
  return `${barra("Sala Projeto", 2)}
  <section class="cartao">
    <h1>Cenário 1 · A mudança de última hora</h1>
    <p>Quarta-feira. A sprint termina na sexta, com demo para o cliente.
    Marina, a PO, vai pedir algo novo. Sua meta é dizer o que é possível sem romper com ela.</p>
    <ul class="chips" aria-label="Sobre o cenário">
      <li>Cerca de 15 min</li><li>Responda por texto</li><li>Pode pausar</li>
    </ul>
    <p class="discreto">A IA analisa a conversa só para gerar o seu relatório.<br>
    Sua liderança não vê o resultado individual.</p>
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
    .map((f) =>
      f.autor === "personagem"
        ? `<div class="fala marina"><span class="quem">Marina</span><p>${esc(f.texto)}</p></div>`
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
       <form class="resposta" data-form="fala">
         <label class="sr" for="campo">Sua resposta</label>
         <textarea id="campo" rows="2" maxlength="1000" placeholder="Digite sua resposta…" aria-describedby="instrucao"
           ${estado.aguardando ? "disabled" : ""}>${esc(estado.textoPendente)}</textarea>
         <button class="primario" type="submit" ${estado.aguardando ? "disabled" : ""}>Enviar</button>
       </form>
       <div class="acoes"><button data-acao="pausar">II Pausar</button><button data-acao="ficha">Ver ficha</button></div>`;
  return `${barra("Sala Projeto", encerrada ? 6 : 3)}
  <section class="dialogo">
    <div class="personagem" aria-hidden="true"><div class="retrato">${retratoMarina()}</div><div><strong>Marina</strong><br><span>Product Owner</span></div></div>
    <div class="conversa">
      <div class="falas" id="falas">${falas}
        ${estado.aguardando && !encerrada ? `<p class="digitando" role="status">Marina está digitando…</p>` : ""}</div>
      ${rodape}
    </div>
  </section>`;
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
  const detalhe = `<ol class="transcricao">${estado.falas
    .map((f) => {
      const destaque = f.autor === "jogador" && citadas.has(f.texto.trim());
      return `<li class="t-${f.autor}"><span class="quem">${f.autor === "jogador" ? "Você" : "Marina"}</span>
        ${destaque ? `<mark>${esc(f.texto)}</mark>` : esc(f.texto)}</li>`;
    })
    .join("")}</ol>
    <p class="discreto">Trechos destacados foram usados na avaliação.</p>`;
  return `${barra("Relatório da conversa", 7)}
  <section class="relatorio">
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
  return `${barra("Sala Projeto", 8)}
  <section class="reflexao">
    <h1>Cenário 1 concluído</h1>
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
      <button class="primario" disabled title="Disponível depois do MVP">Próximo: Cenário 2 (em breve)</button>
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
    const s = await api.iniciar(jogadorId, cenarioId);
    Object.assign(estado, {
      sessaoId: s.sessaoId, maxTrocas: s.maxTrocas, troca: 0,
      falas: [{ autor: "personagem", texto: s.abertura }], tela: "dialogo", relatorio: undefined, aba: "resumo",
    });
  } catch (e) {
    estado.erro = e instanceof ApiError ? e.message : "Algo deu errado.";
  }
  estado.aguardando = false; render(); focarCampo();
}

async function enviar(texto: string): Promise<void> {
  if (!texto.trim() || estado.aguardando) return;
  estado.textoPendente = texto; estado.aguardando = true; estado.erro = "";
  estado.falas.push({ autor: "jogador", texto });
  render();
  try {
    const r = await api.falar(estado.sessaoId, texto);
    estado.falas.push({ autor: "personagem", texto: r.resposta });
    estado.troca = r.troca; estado.textoPendente = "";
    if (r.encerrada) estado.tela = "encerrada";
  } catch (e) {
    estado.falas.pop(); // a fala não chegou: devolve para o campo
    estado.erro = e instanceof ApiError ? e.message : "Algo deu errado.";
  }
  estado.aguardando = false; render(); focarCampo();
}

async function pedirRelatorio(): Promise<void> {
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
      if (acao === "ficha") renderFicha(false);
      if (acao === "pausar") renderFicha(true);
      if (acao === "relatorio") void pedirRelatorio();
      if (acao === "reenviar") void enviar(estado.textoPendente);
      if (acao === "continuar") { estado.tela = "reflexao"; render(); }
    }),
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

render();
