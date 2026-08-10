#!/usr/bin/env bash
# Valida pré-requisitos e resolve o template de tasks da feature ativa.
# Uso: setup-tasks.sh [--json]

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

JSON=0
[[ "${1:-}" == "--json" ]] && JSON=1

load_feature_paths

[[ -f "$FEATURE_SPEC" ]] || { echo "ERRO: spec.md ausente. Rode /speckit.specify." >&2; exit 1; }
[[ -f "$IMPL_PLAN" ]]   || { echo "ERRO: plan.md ausente. Rode /speckit.plan." >&2; exit 1; }

TASKS_TEMPLATE="$(resolve_template tasks-template "$REPO_ROOT")"

DOCS=()
for f in research.md data-model.md quickstart.md; do
  [[ -f "$FEATURE_DIR/$f" ]] && DOCS+=("$f")
done
[[ -d "$CONTRACTS_DIR" ]] && DOCS+=("contracts/")

if [[ $JSON -eq 1 ]]; then
  list=""
  for d in "${DOCS[@]:-}"; do
    [[ -z "$d" ]] && continue
    list="${list:+$list,}\"$(json_escape "$d")\""
  done
  printf '{"FEATURE_DIR":"%s","AVAILABLE_DOCS":[%s],"TASKS_TEMPLATE":"%s","TASKS":"%s"}\n' \
    "$(json_escape "$FEATURE_DIR")" "$list" \
    "$(json_escape "$TASKS_TEMPLATE")" "$(json_escape "$TASKS")"
else
  echo "FEATURE_DIR: $FEATURE_DIR"
  echo "AVAILABLE_DOCS: ${DOCS[*]:-nenhum}"
  echo "TASKS_TEMPLATE: $TASKS_TEMPLATE"
  echo "TASKS: $TASKS"
fi
