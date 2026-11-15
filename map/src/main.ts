/// <reference types="@workadventure/iframe-api-typings" />

import { bootstrapExtra } from "@workadventure/scripting-api-extra";

// URL do painel do jogo (pasta panel/). Em produção, defina VITE_PANEL_URL no .env.
const PANEL_URL: string = import.meta.env.VITE_PANEL_URL ?? "http://localhost:5173";
// URL da API (pasta server/). Em produção: https://<dominio>/painel
const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

const CENARIO = "cenario-1";
// Áreas desenhadas no Tiled (camada floorLayer).
const ZONA_MARINA = "marina";
const SALA = "sala-projeto";
// Objeto do Tiled onde o balão de boas-vindas aparece.
const ANCORA_BOAS_VINDAS = "boas-vindas";

type Fechavel = { close: () => unknown };

let painel: Fechavel | undefined;
let abrindoPainel = false;
let naZonaDaMarina = false;
let mensagem: { remove: () => unknown } | undefined;
let balao: Fechavel | undefined;

WA.onInit()
    .then(async () => {
        WA.room.area.onEnter(ZONA_MARINA).subscribe(entrarNaZonaDaMarina);
        WA.room.area.onLeave(ZONA_MARINA).subscribe(sairDaZonaDaMarina);
        WA.room.area.onEnter(SALA).subscribe(fecharBalao);

        bootstrapExtra().catch((e) => console.error(e));

        // O popup só aparece com a cena pronta; no WA.onInit ela ainda pode estar carregando
        // (ex.: tela "Continue in browser"). Por isso o balão abre no primeiro passo do jogador.
        if (!(await concluiuCenario())) {
            const assinatura = WA.player.onPlayerMove(() => {
                assinatura.unsubscribe();
                mostrarBoasVindas();
            });
        }
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

function mostrarBoasVindas(): void {
    balao = WA.ui.openPopup(ANCORA_BOAS_VINDAS, "Entre na sala Projeto para começar o Cenário 1", [
        { label: "Entendi", className: "primary", callback: fecharBalao },
    ]);
}

function fecharBalao(): void {
    balao?.close();
    balao = undefined;
}

async function entrarNaZonaDaMarina(): Promise<void> {
    naZonaDaMarina = true;
    const texto = (await concluiuCenario())
        ? "Aperte ESPAÇO para conversar de novo com a Marina"
        : "Aperte ESPAÇO para conversar com a Marina";
    // O jogador pode ter saído da zona enquanto a API respondia.
    if (!naZonaDaMarina || painel || abrindoPainel) return;
    mensagem?.remove();
    mensagem = WA.ui.displayActionMessage({ message: texto, callback: abrirPainel });
}

function sairDaZonaDaMarina(): void {
    naZonaDaMarina = false;
    mensagem?.remove();
    mensagem = undefined;
    fecharPainel();
}

async function abrirPainel(): Promise<void> {
    mensagem = undefined; // o WorkAdventure some com a mensagem ao apertar ESPAÇO
    if (painel || abrindoPainel) return;
    abrindoPainel = true;
    try {
        const url = new URL(PANEL_URL);
        url.searchParams.set("cenario", CENARIO);
        url.searchParams.set("jogador", jogadorId());
        // allowApi = false: o painel não precisa controlar o mapa.
        // allowPolicy libera o microfone para o modo voz (REQ-13, depois do MVP).
        const aberto = await WA.nav.openCoWebSite(url.toString(), false, "microphone");
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
    painel?.close();
    painel = undefined;
}

export {};
