# Conversas Difíceis em TI

Jogo 2D no WorkAdventure para treinar comunicação, negociação e resolução de
conflitos. Projeto da disciplina de Design Instrucional para TI (UFRN/IMD, 2026.2).

- `map/`: mapa do WorkAdventure (Tiled + script)
- `panel/`: painel do jogo (telas do storyboard), aberto dentro do WorkAdventure
- `server/`: API que conversa com a LLM e gera o relatório
- `deploy/`: Docker Compose para publicar tudo num servidor (WorkAdventure + painel + API)
- `docs/`: escopo e resumo do design instrucional

## Rodar na sua máquina (Node 22 ou mais novo)

São três terminais.

**1. Servidor**

```bash
cd server
cp .env.example .env    # do jeito que está, usa a Marina SIMULADA (sem chave)
npm install
npm run dev             # http://localhost:8787
```

**2. Painel**

```bash
cd panel
npm install
npm run dev             # abra http://localhost:5173 para jogar fora do mapa
```

**3. Mapa**

```bash
cd map
npm install
npm run start           # abre a página do starter kit; clique em "Test this map"
```

No mapa, vá até a Marina (com o balão "…"), na sala Projeto à direita. Perto
dela, aperte ESPAÇO ou toque em "Conversar com a Marina": o painel abre na lateral.

## Usar a IA de verdade

No `server/.env`, troque `LLM_PROVIDER=mock` por `openai-compatible` e preencha
`LLM_BASE_URL`, `LLM_API_KEY` e `LLM_MODEL` (exemplos de URL no próprio arquivo).
A chave fica só no servidor: nunca coloque no painel nem no Git.

## Publicar no servidor

Passo a passo em [`deploy/README.md`](deploy/README.md): DNS, swap,
`./preparar.sh`, `docker compose up -d --build`, upload do mapa e teste com 10
pessoas.

## Testes

```bash
cd server && npm test
```

## Trabalhando com o Claude Code

Abra o Claude Code na raiz do projeto. O `CLAUDE.md` explica arquitetura,
regras e decisões em aberto; o escopo está em `docs/escopo.md`.
