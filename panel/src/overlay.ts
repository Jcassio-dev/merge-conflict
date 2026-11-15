import "./overlay.css";
import { retratoMarina } from "./retrato";

// Janelas pequenas por cima do jogo, abertas pelo script do mapa com WA.ui.website.open.
// ?modo=boas-vindas  cartão de boas-vindas com "Entendi"
// ?modo=marina       cartão perto da Marina com "Conversar com a Marina" (bom para celular;
//                    no teclado, o ESPAÇO continua funcionando pela mensagem do WorkAdventure)
// O clique volta para o script do mapa pela variável de jogador "conversas_acao".

// Endereço do WorkAdventure, de onde vem a API dos iframes. Vazio = mesmo domínio (produção).
const WA_URL: string = import.meta.env.VITE_WA_URL ?? "https://play.workadventu.re";

type Acao = "fechar-boas-vindas" | "conversar";
type WAApi = {
  onInit: () => Promise<void>;
  player: { state: { saveVariable: (k: string, v: unknown, o?: { persist?: boolean; public?: boolean }) => Promise<void> } };
};

const params = new URLSearchParams(location.search);
const modo = params.get("modo");
const raiz = document.querySelector<HTMLElement>("#overlay")!;

function carregarApi(): Promise<WAApi> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${WA_URL}/iframe_api.js`;
    s.onload = () => {
      const wa = (window as unknown as { WA?: WAApi }).WA;
      if (wa) wa.onInit().then(() => resolve(wa), reject);
      else reject(new Error("API do WorkAdventure não carregou"));
    };
    s.onerror = () => reject(new Error("API do WorkAdventure não carregou"));
    document.head.append(s);
  });
}

const api = carregarApi();

async function avisar(acao: Acao, botao: HTMLButtonElement): Promise<void> {
  botao.disabled = true;
  try {
    const wa = await api;
    // Date.now() faz cada clique ser uma mudança nova, mesmo repetindo a ação.
    await wa.player.state.saveVariable("conversas_acao", `${acao}:${Date.now()}`, { persist: false, public: false });
  } catch (e) {
    console.error(e);
  } finally {
    botao.disabled = false;
  }
}

function render(): void {
  if (modo === "boas-vindas") {
    raiz.innerHTML = `
      <section class="cartao" aria-labelledby="t">
        <h1 id="t">Boas-vindas ao escritório!</h1>
        <p>A Marina está esperando você na <strong>sala Projeto</strong>, no canto direito.</p>
        <button class="primario" type="button">Entendi</button>
      </section>`;
    const b = raiz.querySelector("button")!;
    b.addEventListener("click", () => void avisar("fechar-boas-vindas", b));
  } else if (modo === "marina") {
    const deNovo = params.get("repetir") === "1";
    raiz.innerHTML = `
      <section class="cartao cartao-marina" aria-label="Marina">
        <div class="retrato">${retratoMarina()}</div>
        <div class="texto">
          <button class="primario" type="button">${deNovo ? "Conversar de novo" : "Conversar com a Marina"}</button>
          <p class="dica">ou aperte ESPAÇO</p>
        </div>
      </section>`;
    const b = raiz.querySelector("button")!;
    b.addEventListener("click", () => void avisar("conversar", b));
  }
}

render();
