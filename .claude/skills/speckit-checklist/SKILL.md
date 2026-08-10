---
name: speckit-checklist
description: Gera um checklist de qualidade por domínio (UX, API, segurança, dados) para a especificação ativa — "testes unitários para o português". Portão opcional do fluxo SDD do actual-financas. Use ao invocar /speckit.checklist.
argument-hint: "Domínio do checklist, ex.: ux, api, seguranca, dados"
user-invocable: true
---

# /speckit.checklist — Gerar checklist de qualidade

Domínio pedido: `$ARGUMENTS`

## Conceito: "testes unitários para o português"

**CRÍTICO — entenda isso antes de escrever qualquer item.**

Um checklist NÃO valida se o software funciona. Isso é papel dos testes.
Ele valida se os **requisitos estão bem escritos**.

- ❌ Errado: "Verificar se o botão de importar funciona"
- ✅ Certo: "'Importação rápida' está quantificada com um tempo máximo?" *(clareza)*
- ❌ Errado: "Testar a classificação com 100 transações"
- ✅ Certo: "O limiar de confiança para gravar categoria automaticamente está definido?" *(lacuna)*

Metáfora: se a spec é código escrito em português, o checklist é a suíte de
testes dela.

## Passos

### 1. Prepare

```bash
.specify/scripts/bash/check-prerequisites.sh --json
```

Leia `spec.md`, o que existir de `plan.md` e a constituição.

### 2. Escolha as categorias

Use as dimensões de qualidade como seções do checklist:

Completude dos Requisitos · Clareza · Consistência · Qualidade dos Critérios de
Aceitação · Cobertura de Cenários · Cobertura de Casos de Borda · Requisitos
Não-Funcionais · Dependências e Premissas · Ambiguidades e Conflitos

Filtre pelas que fazem sentido para o domínio pedido em `$ARGUMENTS`.

### 3. Escreva os itens

Arquivo: `FEATURE_DIR/checklists/<dominio>.md`, a partir de
`.specify/templates/checklist-template.md`.

- Itens numerados `CHK###`, **contínuos**. Se o arquivo já existe, **acrescente**
  a partir do próximo número e **nunca remova** item existente.
- **Ao menos 80% dos itens DEVEM citar referência**: `[Spec §X.Y]` ou um marcador
  `[Lacuna]` / `[Ambiguidade]` / `[Conflito]` / `[Premissa]`.
- Limite recomendado: 40 itens candidatos. Mais que isso vira ruído.

### 4. Relate

Informe o caminho do arquivo, quantos itens foram gerados e quais apontam
para lacunas reais que valem discutir agora.
