#!/usr/bin/env bash
# Prepara o .env do servidor e confere o que pode dar errado antes do primeiro "up".
#
# Uso:   ./preparar.sh <dominio-do-jogo> <email-para-o-lets-encrypt>
# Ex.:   ./preparar.sh jogo.meudominio.com.br eu@meudominio.com.br
#
# Rodar de novo é seguro: se o .env já existe, ele não é sobrescrito; o script só
# repete as verificações.
set -euo pipefail
cd "$(dirname "$0")"

ok()    { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
aviso() { printf '  \033[33mATENÇÃO\033[0m %s\n' "$1"; }
erro()  { printf '  \033[31mERRO\033[0m %s\n' "$1"; }
segredo() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
porta_ocupada() { ss -Htln "( sport = :$1 )" 2>/dev/null | grep -q .; }
definir() { sed -i "s|^$1=.*|$1=$2|" .env; }

echo "== Docker"
if docker compose version >/dev/null 2>&1; then ok "$(docker compose version)"; else erro "Docker Compose v2 não encontrado (comando 'docker compose')."; exit 1; fi

echo "== Arquivo .env"
if [[ -f .env ]]; then
  ok ".env já existe; não vou mexer nele."
else
  if [[ $# -lt 2 ]]; then
    erro "Primeira vez: informe o domínio e o e-mail. Ex.: ./preparar.sh jogo.meudominio.com.br eu@meudominio.com.br"
    exit 1
  fi
  cp .env.example .env
  chmod 600 .env
  definir DOMAIN "$1"
  definir ACME_EMAIL "$2"
  definir SECRET_KEY "$(segredo)"
  definir MAP_STORAGE_AUTHENTICATION_TOKEN "$(segredo)"
  definir MAP_STORAGE_AUTHENTICATION_PASSWORD "$(segredo | head -c 24)"
  ok ".env criado com segredos novos (permissão 600)."

  echo "== Portas 80 e 443"
  if porta_ocupada 80 || porta_ocupada 443; then
    aviso "80 ou 443 já estão em uso (provavelmente o proxy do seu LiveKit):"
    ss -Htlnp '( sport = :80 or sport = :443 )' 2>/dev/null | sed 's/^/           /' || true
    definir COMPOSE_FILE "docker-compose.yaml:conversas.yaml:atras-de-proxy.yaml"
    definir HTTP_PORT "127.0.0.1:8080"
    definir HTTPS_PORT "127.0.0.1:8443"
    aviso "Modo ATRÁS DE PROXY ligado: o Traefik do WorkAdventure vai escutar em 127.0.0.1:8080."
    aviso "Configure o seu proxy atual para repassar $1 → http://127.0.0.1:8080 (veja proxy-exemplos/)."
    for p in 8080 8443; do porta_ocupada "$p" && erro "A porta $p também está ocupada. Troque HTTP_PORT/HTTPS_PORT no .env."; done
  else
    ok "80 e 443 livres: o Traefik do WorkAdventure cuida do HTTPS (Let's Encrypt)."
  fi
fi

# lê valores do .env para as verificações
DOMINIO=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)

echo "== Porta 50051 (gRPC, só local)"
if porta_ocupada 50051 && ! docker compose ps --status running 2>/dev/null | grep -q reverse-proxy; then
  erro "50051 ocupada. Troque GRPC_PORT no .env (ex.: 127.0.0.1:50052)."
else ok "livre (ou já é o nosso Traefik)."; fi

echo "== Pendências no .env"
pend=0
for k in LIVEKIT_API_KEY LIVEKIT_API_SECRET TURN_STATIC_AUTH_SECRET; do
  if grep -qE "^$k=$" .env; then aviso "$k está vazio."; pend=1; fi
done
grep -q 'seudominio.com.br' .env && { aviso "Ainda há 'seudominio.com.br' no .env (LIVEKIT_HOST / TURN_SERVER)."; pend=1; }
grep -qE '^LLM_PROVIDER=mock' .env && aviso "LLM_PROVIDER=mock: a Marina está SIMULADA. Troque quando a chave da LLM estiver pronta."
[[ $pend == 0 ]] && ok "nada pendente."

echo "== Memória"
free -m | awk '/^Mem:/ {printf "  RAM disponível: %s MB de %s MB\n", $7, $2} /^Swap:/ {printf "  Swap: %s MB\n", $2; if ($2 < 1024) s=1} END {exit s}' \
  || aviso "Swap menor que 1 GB. Recomendado 2 GB (veja o passo 2 do deploy/README.md)."

echo "== DNS de $DOMINIO"
if ip=$(getent hosts "$DOMINIO" | awk '{print $1; exit}') && [[ -n $ip ]]; then
  ok "$DOMINIO → $ip (confira se é o IP deste servidor)"
else
  aviso "$DOMINIO ainda não resolve. Crie um registro A apontando para o IP deste servidor."
fi

echo
echo "Próximo passo: docker compose up -d --build   (detalhes em deploy/README.md)"
