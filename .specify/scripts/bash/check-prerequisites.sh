#!/usr/bin/env bash
# Valida os pré-requisitos da feature ativa e lista os documentos disponíveis.
# Uso: check-prerequisites.sh [--json] [--require-tasks] [--include-tasks] [--paths-only]

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

JSON=0
REQUIRE_TASKS=0
INCLUDE_TASKS=0
PATHS_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON=1; shift ;;
    --require-tasks) REQUIRE_TASKS=1; shift ;;
    --include-tasks) INCLUDE_TASKS=1; shift ;;
    --paths-only) PATHS_ONLY=1; shift ;;
    *) echo "ERRO: flag desconhecida: $1" >&2; exit 1 ;;
  esac
done

if [[ $PATHS_ONLY -eq 1 ]]; then
  load_feature_paths --no-persist
  if [[ $JSON -eq 1 ]]; then
    printf '{"REPO_ROOT":"%s","BRANCH":"%s","FEATURE_DIR":"%s","FEATURE_SPEC":"%s","IMPL_PLAN":"%s","TASKS":"%s"}\n' \
      "$(json_escape "$REPO_ROOT")" "$(json_escape "$CURRENT_BRANCH")" \
      "$(json_escape "$FEATURE_DIR")" "$(json_escape "$FEATURE_SPEC")" \
      "$(json_escape "$IMPL_PLAN")" "$(json_escape "$TASKS")"
  else
    echo "REPO_ROOT: $REPO_ROOT"
    echo "BRANCH: $CURRENT_BRANCH"
    echo "FEATURE_DIR: $FEATURE_DIR"
    echo "FEATURE_SPEC: $FEATURE_SPEC"
    echo "IMPL_PLAN: $IMPL_PLAN"
    echo "TASKS: $TASKS"
  fi
  exit 0
fi

load_feature_paths

[[ -d "$FEATURE_DIR" ]] || { echo "ERRO: $FEATURE_DIR não existe. Rode /speckit.specify." >&2; exit 1; }
[[ -f "$IMPL_PLAN" ]]   || { echo "ERRO: plan.md ausente. Rode /speckit.plan primeiro." >&2; exit 1; }
if [[ $REQUIRE_TASKS -eq 1 && ! -f "$TASKS" ]]; then
  echo "ERRO: tasks.md ausente. Rode /speckit.tasks primeiro." >&2
  exit 1
fi

DOCS=()
for f in research.md data-model.md quickstart.md; do
  [[ -f "$FEATURE_DIR/$f" ]] && DOCS+=("$f")
done
[[ -d "$CONTRACTS_DIR" ]] && DOCS+=("contracts/")
[[ $INCLUDE_TASKS -eq 1 && -f "$TASKS" ]] && DOCS+=("tasks.md")
for c in "$FEATURE_DIR"/checklists/*.md; do
  [[ -f "$c" ]] && DOCS+=("checklists/$(basename "$c")")
done

if [[ $JSON -eq 1 ]]; then
  list=""
  for d in "${DOCS[@]:-}"; do
    [[ -z "$d" ]] && continue
    list="${list:+$list,}\"$(json_escape "$d")\""
  done
  printf '{"FEATURE_DIR":"%s","AVAILABLE_DOCS":[%s]}\n' \
    "$(json_escape "$FEATURE_DIR")" "$list"
else
  echo "FEATURE_DIR: $FEATURE_DIR"
  echo "AVAILABLE_DOCS: ${DOCS[*]:-nenhum}"
fi
