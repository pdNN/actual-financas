#!/usr/bin/env bash
# Funções compartilhadas pelos scripts do fluxo SDD (spec-kit).
# Carregue com:  source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

set -euo pipefail

# Sobe a árvore de diretórios procurando por .specify/ — é isso, e não o git,
# que define a raiz do projeto spec-kit.
find_specify_root() {
  local dir="${1:-$PWD}"
  dir="$(cd "$dir" && pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/.specify" ]]; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

get_repo_root() {
  if [[ -n "${SPECIFY_INIT_DIR:-}" && -d "${SPECIFY_INIT_DIR}/.specify" ]]; then
    (cd "$SPECIFY_INIT_DIR" && pwd)
    return 0
  fi
  if find_specify_root "$PWD"; then
    return 0
  fi
  # Fallback: dois níveis acima de .specify/scripts/bash/
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "$script_dir/../../.." && pwd)
}

get_current_branch() {
  git rev-parse --abbrev-ref HEAD 2>/dev/null || printf ''
}

feature_json_path() {
  printf '%s/.specify/feature.json\n' "$1"
}

# Lê feature_directory de .specify/feature.json sem depender de jq.
_read_feature_json() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  sed -n 's/.*"feature_directory"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -n1
}

_persist_feature_json() {
  local repo_root="$1" rel_dir="$2"
  mkdir -p "$repo_root/.specify"
  printf '{\n  "feature_directory": "%s"\n}\n' "$rel_dir" \
    > "$(feature_json_path "$repo_root")"
}

# Resolve a feature ativa e exporta os caminhos dos artefatos.
# Prioridade: $SPECIFY_FEATURE_DIRECTORY -> .specify/feature.json -> erro.
# Uso: eval "$(get_feature_paths)"  ou  eval "$(get_feature_paths --no-persist)"
get_feature_paths() {
  local persist=1
  [[ "${1:-}" == "--no-persist" ]] && persist=0

  local repo_root feature_rel
  repo_root="$(get_repo_root)"

  if [[ -n "${SPECIFY_FEATURE_DIRECTORY:-}" ]]; then
    feature_rel="${SPECIFY_FEATURE_DIRECTORY#"$repo_root"/}"
  elif feature_rel="$(_read_feature_json "$(feature_json_path "$repo_root")")" \
    && [[ -n "$feature_rel" ]]; then
    :
  else
    echo "ERRO: nenhuma feature ativa. Rode /speckit.specify primeiro, ou exporte SPECIFY_FEATURE_DIRECTORY=specs/NNN-slug." >&2
    return 1
  fi

  [[ $persist -eq 1 ]] && _persist_feature_json "$repo_root" "$feature_rel"

  local feature_dir="$repo_root/$feature_rel"
  cat <<EOF
REPO_ROOT=$(printf '%q' "$repo_root")
CURRENT_BRANCH=$(printf '%q' "$(get_current_branch)")
FEATURE_DIR=$(printf '%q' "$feature_dir")
FEATURE_SPEC=$(printf '%q' "$feature_dir/spec.md")
IMPL_PLAN=$(printf '%q' "$feature_dir/plan.md")
TASKS=$(printf '%q' "$feature_dir/tasks.md")
RESEARCH=$(printf '%q' "$feature_dir/research.md")
DATA_MODEL=$(printf '%q' "$feature_dir/data-model.md")
QUICKSTART=$(printf '%q' "$feature_dir/quickstart.md")
CONTRACTS_DIR=$(printf '%q' "$feature_dir/contracts")
EOF
}

# Envoltório de get_feature_paths que aborta o script quando não há feature ativa.
# Uso: load_feature_paths           ou   load_feature_paths --no-persist
load_feature_paths() {
  local out
  out="$(get_feature_paths "$@")" || exit 1
  eval "$out"
}

# Resolve um template pelo nome, respeitando overrides do projeto.
# 1) .specify/templates/overrides/<nome>.md   2) .specify/templates/<nome>.md
resolve_template() {
  local name="$1" root="${2:-$(get_repo_root)}"
  local override="$root/.specify/templates/overrides/${name}.md"
  local core="$root/.specify/templates/${name}.md"
  if [[ -f "$override" ]]; then
    printf '%s\n' "$override"
  elif [[ -f "$core" ]]; then
    printf '%s\n' "$core"
  else
    echo "ERRO: template '${name}' não encontrado em .specify/templates/." >&2
    return 1
  fi
}

# Escapa uma string para uso como valor JSON.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}
