#!/usr/bin/env bash
# Cria specs/NNN-slug/spec.md a partir do template, registra a feature ativa
# em .specify/feature.json e (por padrão) cria a branch git NNN-slug.
#
# Uso: create-new-feature.sh [--json] [--dry-run] [--no-branch]
#                            [--short-name <slug>] [--number N] <descrição>

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

JSON=0
DRY_RUN=0
NO_BRANCH=0
SHORT_NAME=""
FORCE_NUMBER=""
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-branch) NO_BRANCH=1; shift ;;
    --short-name) SHORT_NAME="${2:-}"; shift 2 ;;
    --number) FORCE_NUMBER="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

DESCRIPTION="${ARGS[*]:-}"
if [[ -z "$DESCRIPTION" && -z "$SHORT_NAME" ]]; then
  echo "ERRO: informe a descrição da feature." >&2
  exit 1
fi

REPO_ROOT="$(get_repo_root)"
SPECS_DIR="$REPO_ROOT/specs"

# --- numeração: maior NNN existente + 1, base 10 forçada (evita octal) ---
next_number() {
  local highest=0 name num
  if [[ -d "$SPECS_DIR" ]]; then
    for dir in "$SPECS_DIR"/*/; do
      [[ -d "$dir" ]] || continue
      name="$(basename "$dir")"
      [[ "$name" =~ ^([0-9]{3,})- ]] || continue
      num=$((10#${BASH_REMATCH[1]}))
      (( num > highest )) && highest=$num
    done
  fi
  printf '%03d' $((highest + 1))
}

# --- slug: minúsculas, sem stop-words, 3 palavras (4 se sobrarem exatamente 4) ---
STOP_WORDS='^(i|a|o|as|os|um|uma|de|do|da|dos|das|no|na|nos|nas|em|para|por|com|sem|que|e|ou|ao|aos|the|to|for|of|in|on|at|by|with|from|is|are|and|or|want|need|add|get|set|use|using|quero|queria|preciso|precisa|fazer|criar|adicionar|usar|usando|nosso|nossa|meu|minha|seu|sua|esse|essa|este|esta|isso)$'

# Transliteração explícita de acentos do português — mais confiável que
# `iconv //TRANSLIT`, que depende do locale e come os caracteres em C/POSIX.
# Cada padrão é uma sequência de bytes literal: classes de caracteres ([àáâ])
# NÃO funcionam aqui, porque sed é orientado a byte e cada acentuado ocupa dois.
deaccent() {
  printf '%s' "$1" | sed \
    -e 's/à/a/g' -e 's/á/a/g' -e 's/â/a/g' -e 's/ã/a/g' -e 's/ä/a/g' \
    -e 's/è/e/g' -e 's/é/e/g' -e 's/ê/e/g' -e 's/ë/e/g' \
    -e 's/ì/i/g' -e 's/í/i/g' -e 's/î/i/g' -e 's/ï/i/g' \
    -e 's/ò/o/g' -e 's/ó/o/g' -e 's/ô/o/g' -e 's/õ/o/g' -e 's/ö/o/g' \
    -e 's/ù/u/g' -e 's/ú/u/g' -e 's/û/u/g' -e 's/ü/u/g' \
    -e 's/ç/c/g' -e 's/ñ/n/g'
}

make_slug() {
  local raw="$1" cleaned words=() w
  cleaned="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  cleaned="$(deaccent "$cleaned")"
  cleaned="$(printf '%s' "$cleaned" | sed 's/[^a-z0-9]\+/ /g')"
  for w in $cleaned; do
    [[ "$w" =~ $STOP_WORDS ]] && continue
    (( ${#w} < 3 )) && continue
    words+=("$w")
  done
  # Se filtrou tudo, cai de volta nas palavras cruas.
  if (( ${#words[@]} == 0 )); then
    for w in $cleaned; do words+=("$w"); done
  fi
  local take=3
  (( ${#words[@]} == 4 )) && take=4
  local out=""
  for ((i = 0; i < take && i < ${#words[@]}; i++)); do
    out="${out:+$out-}${words[i]}"
  done
  printf '%s' "$out"
}

FEATURE_NUM="${FORCE_NUMBER:-$(next_number)}"
[[ "$FEATURE_NUM" =~ ^[0-9]+$ ]] && FEATURE_NUM="$(printf '%03d' $((10#$FEATURE_NUM)))"

SLUG="${SHORT_NAME:-$(make_slug "$DESCRIPTION")}"
if [[ -z "$SLUG" ]]; then
  echo "ERRO: não foi possível derivar um slug da descrição." >&2
  exit 1
fi

BRANCH_NAME="${FEATURE_NUM}-${SLUG}"
BRANCH_NAME="${BRANCH_NAME:0:244}"
FEATURE_REL="specs/${BRANCH_NAME}"
FEATURE_DIR="$REPO_ROOT/$FEATURE_REL"
SPEC_FILE="$FEATURE_DIR/spec.md"

emit() {
  if [[ $JSON -eq 1 ]]; then
    printf '{"BRANCH_NAME":"%s","SPEC_FILE":"%s","FEATURE_NUM":"%s","FEATURE_DIR":"%s"}\n' \
      "$(json_escape "$BRANCH_NAME")" "$(json_escape "$SPEC_FILE")" \
      "$(json_escape "$FEATURE_NUM")" "$(json_escape "$FEATURE_DIR")"
  else
    echo "BRANCH_NAME: $BRANCH_NAME"
    echo "SPEC_FILE: $SPEC_FILE"
    echo "FEATURE_NUM: $FEATURE_NUM"
    echo "FEATURE_DIR: $FEATURE_DIR"
  fi
}

if [[ $DRY_RUN -eq 1 ]]; then
  emit
  exit 0
fi

if [[ -e "$FEATURE_DIR" ]]; then
  echo "ERRO: $FEATURE_REL já existe." >&2
  exit 1
fi

TEMPLATE="$(resolve_template spec-template "$REPO_ROOT")"
mkdir -p "$FEATURE_DIR/checklists"
cp "$TEMPLATE" "$SPEC_FILE"
_persist_feature_json "$REPO_ROOT" "$FEATURE_REL"

if [[ $NO_BRANCH -eq 0 ]] && git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    git -C "$REPO_ROOT" checkout "$BRANCH_NAME" >&2
  else
    git -C "$REPO_ROOT" checkout -b "$BRANCH_NAME" >&2
  fi
fi

emit
echo "export SPECIFY_FEATURE_DIRECTORY=$FEATURE_REL" >&2
