# Publicar no servidor (Debian + Docker)

Tudo roda num servidor só, num domínio só, ao lado do LiveKit e do TURN que já
existem nele:

| Endereço | O que é | Container |
| --- | --- | --- |
| `https://<dominio>/` | WorkAdventure (o mapa) | `play`, `back`, `map-storage`, `redis`, `icon`, `uploader` |
| `https://<dominio>/painel/` | Painel do jogo | `painel` (nginx) |
| `https://<dominio>/painel/api/` | API (Marina, relatório, progresso) | `api` (Node) |
| `https://<dominio>/map-storage/` | Onde o mapa fica guardado | `map-storage` |

O Traefik (`reverse-proxy`) recebe tudo e distribui pelos containers. O LiveKit e o
TURN continuam como estão; o WorkAdventure só passa a usá-los.

Arquivos desta pasta:

| Arquivo | Para quê |
| --- | --- |
| `docker-compose.yaml` | Cópia **sem alteração** do `contrib/docker/docker-compose.prod.yaml` oficial do WorkAdventure, tag **v1.34.5** |
| `conversas.yaml` | Acrescenta o painel e a API ao mesmo Traefik |
| `atras-de-proxy.yaml` | Só se as portas 80/443 já estiverem ocupadas (ver passo 4) |
| `.env.example` | Modelo oficial do `.env` (v1.34.5) com os ajustes do projeto marcados com `# [conversas]` e a seção do jogo no final |
| `preparar.sh` | Cria o `.env` com segredos novos e confere portas, memória, DNS e pendências |
| `proxy-exemplos/` | Trechos de Caddy e nginx para o modo “atrás de proxy” |

> A versão do WorkAdventure está fixada em `VERSION=v1.34.5`, a mesma do
> `docker-compose.yaml`. Para atualizar, troque **os dois juntos** (baixe o
> compose e o `.env.prod.template` da nova tag).

## 1. DNS

Crie um registro **A** do subdomínio do jogo (ex.: `jogo.seudominio.com.br`)
apontando para o IP do servidor. Libere as portas **80 e 443/TCP** no firewall,
se ainda não estiverem liberadas.

## 2. Swap (recomendado: 2 GB)

Com cerca de 3 GB livres e LiveKit + TURN na mesma máquina, a swap evita que o
sistema mate um container num pico de uso.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system
```

## 3. Levar o projeto e preparar o `.env`

```bash
# no servidor (git clone do repositório da equipe, ou envie o zip com scp)
cd conversas-dificeis-ti/deploy
./preparar.sh jogo.seudominio.com.br seu-email@exemplo.com
```

O script:

- cria o `.env` (permissão 600) com `SECRET_KEY`, o token e a senha do
  map-storage gerados na hora;
- vê se as portas 80/443 estão livres e, se não estiverem, liga sozinho o modo
  “atrás de proxy” (passo 4);
- avisa o que ainda falta preencher, a memória e a swap, e se o DNS já resolve.

Pode rodar de novo quando quiser: ele não sobrescreve um `.env` existente.

Depois, abra o `.env` e preencha (procure por `# [conversas]`):

| Variável | Onde achar |
| --- | --- |
| `LIVEKIT_HOST` | URL pública do seu LiveKit, ex.: `https://livekit.seudominio.com.br` |
| `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` | No `livekit.yaml`, seção `keys:` (`chave: segredo`) |
| `TURN_SERVER` | Seu coturn. Ex.: `turn:turn.seudominio.com.br:3478,turns:turn.seudominio.com.br:5349` |
| `TURN_STATIC_AUTH_SECRET` | No `turnserver.conf`, linha `static-auth-secret=` (com `use-auth-secret`) |

Se o seu coturn usa usuário e senha fixos (`user=...` no `turnserver.conf`) em vez
de `static-auth-secret`, deixe `TURN_STATIC_AUTH_SECRET` vazio e preencha
`TURN_USER` e `TURN_PASSWORD`. A documentação do WorkAdventure recomenda o segredo
estático: usuário e senha ficam visíveis no navegador de quem joga.

Já vêm ajustados no `.env.example`: editor de mapa desligado (ninguém mexe no
mapa pelo navegador), upload de arquivos no chat desligado, porta gRPC só local,
fuso `America/Fortaleza` e `START_ROOM_URL=/~/conversas/escritorio.wam`.

## 4. Portas 80/443 já ocupadas? (modo “atrás de proxy”)

Veja quem usa as portas:

```bash
sudo ss -tlnp '( sport = :80 or sport = :443 )'
```

- **Livres:** nada a fazer. O Traefik do WorkAdventure emite o certificado do
  Let's Encrypt sozinho.
- **Ocupadas** (comum quando o LiveKit foi instalado com Caddy ou nginx): o
  `preparar.sh` já trocou o `.env` para `COMPOSE_FILE=...:atras-de-proxy.yaml`
  e `HTTP_PORT=127.0.0.1:8080`. Falta ensinar o proxy atual a repassar o
  domínio do jogo para `http://127.0.0.1:8080`, com WebSocket:
  - Caddy (Caddyfile): `proxy-exemplos/Caddyfile`
  - nginx: `proxy-exemplos/nginx.conf`
  - Se o Caddy foi gerado pelo instalador do LiveKit (arquivo `caddy.yaml`, com
    `layer4`), o formato é outro. Peça ajuda ao Claude Code colando o
    `caddy.yaml` (sem as chaves) e a saída do `ss` acima.

## 5. Subir

```bash
docker compose up -d --build     # a primeira vez demora: baixa imagens e compila painel e API
docker compose ps                # todos "running"; a api fica "healthy"
docker compose logs -f api painel reverse-proxy
```

Confira no navegador:

- `https://<dominio>/painel/` mostra o briefing do Cenário 1 (a API está com a
  Marina simulada até o passo 7);
- `https://<dominio>/painel/api/progresso/teste` responde `{"progresso":{}}`.

## 6. Publicar o mapa

No seu computador (ou no servidor), na pasta `map/` do projeto:

1. No `map/.env`, aponte o mapa para o painel e para a API publicados:
   `VITE_PANEL_URL=https://<dominio>/painel/` e
   `VITE_API_URL=https://<dominio>/painel`
2. Rode `npm install` (se ainda não rodou) e `npm run upload`. Ele pergunta:
   - URL do map-storage: `https://<dominio>/map-storage/`
   - API key: o valor de `MAP_STORAGE_AUTHENTICATION_TOKEN` do `.env` do servidor
   - pasta (directory): `conversas`

   As respostas ficam em `map/.env` e `map/.env.secret` (este fora do Git).
3. Abra `https://<dominio>/map-storage/` (usuário `admin`, senha em
   `MAP_STORAGE_AUTHENTICATION_PASSWORD`) e confira o endereço do mapa. Deve ser
   `/~/conversas/escritorio.wam`. Se for outro, ajuste `START_ROOM_URL` no `.env` e
   rode `docker compose up -d`.
4. Abra `https://<dominio>/`, entre na sala de reunião à direita: o painel abre
   na lateral.

Toda mudança no mapa ou no script `map/src/main.ts` exige um novo `npm run upload`.

## 7. Ligar a IA de verdade

No `.env` do servidor, seção do jogo (no final):

```
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=...      # exemplos no próprio .env
LLM_API_KEY=...
LLM_MODEL=...
```

```bash
docker compose up -d api
```

Antes do piloto:

- configure um **limite de gasto** no painel do provedor;
- confirme que a conta está com uso dos dados para treino **desligado**;
- `LIMITE_SESSOES_POR_HORA` (padrão 300) limita quantas conversas novas começam
  por hora, somando todos os jogadores. Acima disso a API responde “Muitas
  conversas começaram na última hora”.

## 8. Teste com 10 pessoas (antes de 24/11)

Três ou quatro membros da equipe, cada um com duas ou três abas, entram ao mesmo
tempo, andam juntos (vídeo em grupo) e jogam o Cenário 1. No servidor:

```bash
watch -n 5 'free -h; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"'
```

Anote: memória livre mais baixa, uso de swap, se o vídeo travou, tempo de resposta
da Marina. Se a memória acabar ou a swap passar de ~1 GB em uso, o plano B é
manter o mapa no SaaS do WorkAdventure (plano gratuito) e deixar neste servidor
só o painel e a API.

## Operação

```bash
# atualizar painel/API depois de um git pull
docker compose up -d --build painel api

# ver erros
docker compose logs --since 30m api

# parar tudo / subir de novo
docker compose down
docker compose up -d
```

**Atenção:** sessões e progresso ficam na memória da API. Reiniciar o container
`api` apaga o progresso dos jogadores. Durante o piloto, não reinicie sem
necessidade. (Persistir em disco é a próxima melhoria do `server/`.)

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Certificado não sai (aviso de site inseguro) | DNS ainda não aponta para o servidor, ou porta 80 fechada no firewall. `docker compose logs reverse-proxy` |
| Mapa abre, mas vídeo entre jogadores não conecta | `TURN_SERVER` ou `TURN_STATIC_AUTH_SECRET` errados; teste com dois jogadores em redes diferentes (ex.: 4G) |
| Mais de 4 pessoas juntas e o vídeo cai | `LIVEKIT_*` errados; veja `docker compose logs back` |
| Painel não abre ao apertar ESPAÇO perto da Marina | `VITE_PANEL_URL` errado no `map/.env` na hora do upload; corrija e rode `npm run upload` de novo |
| Cartões por cima do jogo (boas-vindas, "Conversar com a Marina") não aparecem ou o botão não faz nada | `VITE_PANEL_URL` errado (o cartão é `<painel>/overlay.html`) ou o painel não acha `/iframe_api.js` no domínio do WorkAdventure (`VITE_WA_URL` no build do painel; vazio = mesmo domínio) |
| Balão de boas-vindas volta mesmo depois de concluir | `VITE_API_URL` errado no `map/.env` na hora do upload |
| Painel abre, mas “A IA não respondeu agora” | Chave, modelo ou URL da LLM; `docker compose logs api` |
| `npm run upload` dá 401 | API key diferente de `MAP_STORAGE_AUTHENTICATION_TOKEN` |
