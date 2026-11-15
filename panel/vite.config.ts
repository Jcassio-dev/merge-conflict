import { resolve } from "node:path";
import { defineConfig } from "vite";

// PAINEL_BASE: caminho onde o painel é servido. No servidor de produção ele fica
// em https://<dominio>/painel/ (ver deploy/). Em desenvolvimento, a raiz.
export default defineConfig({
  base: process.env.PAINEL_BASE ?? "/",
  build: {
    rollupOptions: {
      // index.html: painel da conversa (co-website).
      // overlay.html: janelas pequenas por cima do jogo (WA.ui.website), abertas pelo script do mapa.
      input: { index: resolve(__dirname, "index.html"), overlay: resolve(__dirname, "overlay.html") },
    },
  },
});
