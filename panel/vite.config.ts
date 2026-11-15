import { defineConfig } from "vite";

// PAINEL_BASE: caminho onde o painel é servido. No servidor de produção ele fica
// em https://<dominio>/painel/ (ver deploy/). Em desenvolvimento, a raiz.
export default defineConfig({
  base: process.env.PAINEL_BASE ?? "/",
});
