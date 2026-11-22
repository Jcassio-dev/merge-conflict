import { resolve } from "node:path";
import { defineConfig } from "vite";

// PAINEL_BASE: caminho onde o painel é servido. No servidor de produção ele fica
// em https://<dominio>/painel/ (ver deploy/). Em desenvolvimento, a raiz.
export default defineConfig({
  base: process.env.PAINEL_BASE ?? "/",
  build: {
    rollupOptions: {
      // index.html: o escritório (mapa, movimento e multiplayer). Abre a conversa ao lado.
      // conversa.html: painel da conversa com a Marina.
      // overlay.html: só para o plano B no WorkAdventure (janelas por cima do jogo, WA.ui.website).
      input: {
        index: resolve(__dirname, "index.html"),
        conversa: resolve(__dirname, "conversa.html"),
        overlay: resolve(__dirname, "overlay.html"),
      },
    },
  },
});
