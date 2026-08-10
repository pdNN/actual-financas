#!/usr/bin/env bash
# >>> CUSTOM: actual-financas — deploy de uma versão na VM
#
# Roda NA VM, em /opt/actual. Recebe a tag imutável da imagem (o SHA do commit)
# e sobe essa versão, com rollback automático se ela não ficar saudável.
#
#   sudo ./deploy.sh sha-a1b2c3d
#
# O CI chama este script por SSH, mas ele é feito para ser rodável à mão —
# é exatamente isso que você quer às 23h quando o deploy quebrou.
set -euo pipefail

readonly COMPOSE_FILE=/opt/actual/docker-compose.prod.yml
readonly CONTAINER=actual-budget
readonly HEALTH_TIMEOUT=120

cd /opt/actual

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "uso: $0 <tag-da-imagem>" >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

# Guarda a tag atual ANTES de mexer em qualquer coisa — é o alvo do rollback.
previous_tag() {
  docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null \
    | awk -F: '{print $NF}' || true
}

# Espera o healthcheck que já existe no docker-compose.prod.yml virar
# "healthy". Isso é bem mais confiável que dormir 30 segundos e torcer.
wait_healthy() {
  local waited=0
  while ((waited < HEALTH_TIMEOUT)); do
    local status
    status="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)"
    case "$status" in
      healthy) return 0 ;;
      unhealthy)
        echo "container ficou unhealthy após ${waited}s"
        return 1
        ;;
    esac
    sleep 5
    waited=$((waited + 5))
  done
  echo "timeout: container não ficou healthy em ${HEALTH_TIMEOUT}s"
  return 1
}

PREVIOUS="$(previous_tag)"
echo "==> tag atual: ${PREVIOUS:-(nenhuma)}"
echo "==> alvo:      ${TAG}"

echo '==> renovando .env a partir do Secret Manager'
bash /opt/actual/generate-env.sh

echo '==> baixando a imagem'
ACTUAL_IMAGE_TAG="$TAG" compose pull actual

echo '==> subindo'
ACTUAL_IMAGE_TAG="$TAG" compose up -d

if wait_healthy; then
  echo "==> deploy OK: ${TAG}"
  docker image prune -f >/dev/null
  exit 0
fi

# --- Rollback ---
echo "==> deploy FALHOU; últimas linhas de log:" >&2
docker logs "$CONTAINER" --tail 50 2>&1 | sed 's/^/    /' >&2

if [[ -z "$PREVIOUS" || "$PREVIOUS" == "$TAG" ]]; then
  echo "==> sem versão anterior conhecida para voltar; a VM ficou na versão quebrada" >&2
  exit 1
fi

echo "==> voltando para ${PREVIOUS}" >&2
ACTUAL_IMAGE_TAG="$PREVIOUS" compose up -d

if wait_healthy; then
  echo "==> rollback concluído: a VM está em ${PREVIOUS}" >&2
else
  echo "==> rollback TAMBÉM falhou — precisa de intervenção manual" >&2
fi
exit 1
# <<< CUSTOM
