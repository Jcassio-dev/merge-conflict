/// <reference types="@workadventure/iframe-api-typings" />

import { bootstrapExtra } from "@workadventure/scripting-api-extra";

// URL do painel do jogo (pasta panel/). Em produção, defina VITE_PANEL_URL no .env.
const PANEL_URL: string = import.meta.env.VITE_PANEL_URL ?? "http://localhost:5173";

// Área desenhada no Tiled (camada floorLayer, objeto do tipo "area").
const AREA_CENARIO_1 = "sala-projeto";

let painelAberto: { close: () => Promise<void> } | undefined;

WA.onInit()
    .then(() => {
        WA.room.area.onEnter(AREA_CENARIO_1).subscribe(abrirPainel);
        WA.room.area.onLeave(AREA_CENARIO_1).subscribe(fecharPainel);

        bootstrapExtra().catch((e) => console.error(e));
    })
    .catch((e) => console.error(e));

async function abrirPainel(): Promise<void> {
    if (painelAberto) return;
    const url = new URL(PANEL_URL);
    url.searchParams.set("cenario", "cenario-1");
    // ID anônimo do jogador no WorkAdventure (não envia nome nem e-mail).
    url.searchParams.set("jogador", WA.player.uuid ?? "anonimo");
    // allowApi = false: o painel não precisa controlar o mapa.
    // allowPolicy libera o microfone para o modo voz (REQ-13, depois do MVP).
    painelAberto = await WA.nav.openCoWebSite(url.toString(), false, "microphone");
}

async function fecharPainel(): Promise<void> {
    if (!painelAberto) return;
    await painelAberto.close();
    painelAberto = undefined;
}

export {};
