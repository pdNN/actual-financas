#!/usr/bin/env bash
# Prepara plan.md da feature ativa a partir do template (não sobrescreve).
# Uso: setup-plan.sh [--json]

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

JSON=0
[[ "${1:-}" == "--json" ]] && JSON=1

load_feature_paths

if [[ ! -f "$FEATURE_SPEC" ]]; then
  echo "ERRO: $FEATURE_SPEC não existe. Rode /speckit.specify primeiro." >&2
  exit 1
fi

mkdir -p "$FEATURE_DIR"
if [[ ! -f "$IMPL_PLAN" ]]; then
  cp "$(resolve_template plan-template "$REPO_ROOT")" "$IMPL_PLAN"
fi

if [[ $JSON -eq 1 ]]; then
  printf '{"FEATURE_SPEC":"%s","IMPL_PLAN":"%s","SPECS_DIR":"%s","BRANCH":"%s"}\n' \
    "$(json_escape "$FEATURE_SPEC")" "$(json_escape "$IMPL_PLAN")" \
    "$(json_escape "$FEATURE_DIR")" "$(json_escape "$CURRENT_BRANCH")"
else
  echo "FEATURE_SPEC: $FEATURE_SPEC"
  echo "IMPL_PLAN: $IMPL_PLAN"
  echo "SPECS_DIR: $FEATURE_DIR"
  echo "BRANCH: $CURRENT_BRANCH"
fi
