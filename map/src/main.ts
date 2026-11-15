/// <reference types="@workadventure/iframe-api-typings" />

import { bootstrapExtra } from "@workadventure/scripting-api-extra";

// URL do painel do jogo (pasta panel/). Em produção, defina VITE_PANEL_URL no .env.
const PANEL_URL: string = import.meta.env?.VITE_PANEL_URL ?? "http://localhost:5173";
// URL da API (pasta server/). Em produção: https://<dominio>/painel
const API_URL: string = import.meta.env?.VITE_API_URL ?? "http://localhost:8787";

const CENARIO = "cenario-1";
// Áreas desenhadas no Tiled (camada floorLayer).
const ZONA_MARINA = "marina";
const SALA = "sala-projeto";
// Camada do Tiled com o balão "…" acima da Marina; some para quem já concluiu.
const CAMADA_BALAO = "balao-marina";
// Variável de jogador que as janelas por cima do jogo (panel/overlay.html) usam para avisar cliques.
const VAR_ACAO = "conversas_acao";

type Fechavel = { close: () => Promise<void> };

let painel: Fechavel | undefined;
let abrindoPainel = false;
let naZonaDaMarina = false;
let mensagem: { remove: () => unknown } | undefined;
let balao: Fechavel | undefined;
let balaoFechado = false;
let cartaoMarina: Fechavel | undefined;

WA.onInit()
    .then(async () => {
        WA.room.area.onEnter(ZONA_MARINA).subscribe(entrarNaZonaDaMarina);
        WA.room.area.onLeave(ZONA_MARINA).subscribe(sairDaZonaDaMarina);
        WA.room.area.onEnter(SALA).subscribe(fecharBalao);
        WA.player.state.onVariableChange(VAR_ACAO).subscribe((valor) => {
            const acao = String(valor ?? "").split(":")[0];
            if (acao === "fechar-boas-vindas") fecharBalao();
            if (acao === "conversar" && naZonaDaMarina) void abrirPainel();
        });

        bootstrapExtra().catch((e) => console.error(e));

        if (await concluiuCenario()) {
            WA.room.hideLayer(CAMADA_BALAO);
            return;
        }
        // A janela só aparece com a cena pronta; no WA.onInit ela ainda pode estar carregando
        // (ex.: tela "Continue in browser"). Por isso o balão abre no primeiro passo do jogador.
        const assinatura = WA.player.onPlayerMove(() => {
            assinatura.unsubscribe();
            void mostrarBoasVindas();
        });
    })
    .catch((e) => console.error(e));

function jogadorId(): string {
    // ID anônimo do jogador no WorkAdventure (não envia nome nem e-mail).
    return WA.player.uuid ?? "anonimo";
}

/** true se o jogador já concluiu o cenário. Qualquer falha (API fora, CORS) conta como false. */
async function concluiuCenario(): Promise<boolean> {
    try {
        const res = await fetch(`${API_URL}/api/progresso/${encodeURIComponent(jogadorId())}`, {
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return false;
        const dados = (await res.json()) as { progresso?: Record<string, { concluido?: boolean }> };
        return dados.progresso?.[CENARIO]?.concluido === true;
    } catch {
        return false;
    }
}

function urlOverlay(modo: string, extras: Record<string, string> = {}): string {
    const url = new URL("overlay.html", PANEL_URL.endsWith("/") ? PANEL_URL : `${PANEL_URL}/`);
    url.searchParams.set("modo", modo);
    for (const [k, v] of Object.entries(extras)) url.searchParams.set(k, v);
    return url.toString();
}

async function mostrarBoasVindas(): Promise<void> {
    try {
        const aberto = await WA.ui.website.open({
            url: urlOverlay("boas-vindas"),
            allowApi: true,
            position: { vertical: "top", horizontal: "middle" },
            size: { width: "320px", height: "170px" },
            margin: { top: "16px" },
        });
        // O jogador pode ter entrado na sala (ou clicado em Entendi) enquanto a janela abria.
        if (balaoFechado) await aberto.close();
        else balao = aberto;
    } catch (e) {
        console.error(e);
    }
}

function fecharBalao(): void {
    balaoFechado = true;
    balao?.close().catch((e) => console.error(e));
    balao = undefined;
}

async function mostrarCartaoMarina(deNovo: boolean): Promise<void> {
    try {
        const aberto = await WA.ui.website.open({
            url: urlOverlay("marina", deNovo ? { repetir: "1" } : {}),
            allowApi: true,
            position: { vertical: "bottom", horizontal: "middle" },
            size: { width: "340px", height: "124px" },
            // Acima da mensagem "Aperte ESPAÇO" e da barra de ações do WorkAdventure.
            margin: { bottom: "120px" },
        });
        if (!naZonaDaMarina || painel || abrindoPainel) await aberto.close();
        else cartaoMarina = aberto;
    } catch (e) {
        console.error(e);
    }
}

function fecharCartaoMarina(): void {
    cartaoMarina?.close().catch((e) => console.error(e));
    cartaoMarina = undefined;
}

async function entrarNaZonaDaMarina(): Promise<void> {
    naZonaDaMarina = true;
    const deNovo = await concluiuCenario();
    // O jogador pode ter saído da zona enquanto a API respondia.
    if (!naZonaDaMarina || painel || abrindoPainel) return;
    mostrarConvites(deNovo);
}

/** ESPAÇO (mensagem do WorkAdventure) para o teclado e cartão com botão para o toque. */
function mostrarConvites(deNovo: boolean): void {
    const texto = deNovo
        ? "Aperte ESPAÇO para conversar de novo com a Marina"
        : "Aperte ESPAÇO para conversar com a Marina";
    mensagem?.remove();
    mensagem = WA.ui.displayActionMessage({
        message: texto,
        callback: () => {
            mensagem = undefined; // o WorkAdventure some com a mensagem ao apertar ESPAÇO
            void abrirPainel();
        },
    });
    if (!cartaoMarina) void mostrarCartaoMarina(deNovo);
}

function esconderConvites(): void {
    mensagem?.remove();
    mensagem = undefined;
    fecharCartaoMarina();
}

function sairDaZonaDaMarina(): void {
    naZonaDaMarina = false;
    esconderConvites();
    fecharPainel();
}

async function abrirPainel(): Promise<void> {
    if (painel || abrindoPainel) return;
    abrindoPainel = true;
    esconderConvites();
    try {
        const url = new URL(PANEL_URL);
        url.searchParams.set("cenario", CENARIO);
        url.searchParams.set("jogador", jogadorId());
        // allowApi = false: o painel não precisa controlar o mapa.
        // allowPolicy: microfone para o jogador falar e autoplay para a voz da Marina.
        // closable = false: o painel fecha ao se afastar da Marina. Com o X do WorkAdventure,
        // o jogador fecharia o painel sem o script saber e o ESPAÇO pararia de funcionar.
        const aberto = await WA.nav.openCoWebSite(url.toString(), false, "microphone; autoplay", undefined, undefined, false);
        // Saiu da zona enquanto o painel abria: fecha na hora.
        if (!naZonaDaMarina) await aberto.close();
        else painel = aberto;
    } catch (e) {
        console.error(e);
    } finally {
        abrindoPainel = false;
    }
}

function fecharPainel(): void {
    painel?.close().catch((e) => console.error(e));
    painel = undefined;
}

export {};
