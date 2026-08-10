---
name: speckit-plan
description: Gera o plano de implementação da feature ativa (contexto técnico, verificação da constituição, pesquisa e design). Terceiro passo do fluxo SDD do actual-financas. Use após a spec estar clara, ou ao invocar /speckit.plan.
argument-hint: "(opcional) direcionamento técnico, ex.: 'usar MCP local em vez de API'"
user-invocable: true
---

# /speckit.plan — Planejar a implementação

Direcionamento opcional do usuário: `$ARGUMENTS`

## Objetivo

Traduzir o QUE da spec no COMO técnico, passando pelos portões da constituição.

## Passos

### 1. Prepare

```bash
.specify/scripts/bash/setup-plan.sh --json
```

Devolve `FEATURE_SPEC`, `IMPL_PLAN`, `SPECS_DIR`, `BRANCH`. O `plan.md` já está
criado a partir do template (não sobrescreve um existente).

Leia: `FEATURE_SPEC`, `.specify/memory/constitution.md`, `CLAUDE.md` e `AGENTS.md`.

### 2. Preencha o Contexto Técnico

Complete a tabela do `IMPL_PLAN`. Todo item que você não sabe vira
`NECESSITA ESCLARECIMENTO` e é resolvido na Fase 0.

Liste explicitamente **quais pacotes serão tocados** e onde o código vai morar
(diretório custom, por causa do princípio II).

### 3. Verificação da Constituição — PORTÃO

Derive os itens de verificação dos princípios vigentes em
`.specify/memory/constitution.md` e avalie um por um.

**Se houver violação sem justificativa: PARE e reporte erro.** Não siga para a
Fase 0. Uma violação só passa se estiver registrada na tabela "Rastreamento de
Complexidade", com a alternativa mais simples avaliada e rejeitada por escrito.

Atenção especial neste repositório:

- **II** — se você vai editar arquivo do upstream, liste cada arquivo aqui.
- **III** — descreva explicitamente qual é a camada determinística e o que sobra para a IA.
- **V** — declare o impacto de memória; se algo pesado precisa rodar, diga onde roda fora da VM.

### 4. Fase 0 — Pesquisa → `research.md`

Para cada `NECESSITA ESCLARECIMENTO` e cada escolha técnica relevante, grave:

```
Decisão: [o que foi escolhido]
Justificativa: [por quê]
Alternativas consideradas: [o que mais foi avaliado e por que foi descartado]
```

Pesquise o código existente antes de propor código novo. Este repositório já tem
motor de regras (`packages/loot-core/src/server/rules/`), aprendizado por payee
(`transaction-rules.ts`), importador (`ImportTransactionsModal.tsx`) e um
classificador Gemini (`packages/sync-server/src/app-ai/app-ai.ts`). Reusar vence
reescrever.

Ao terminar, não pode restar nenhum `NECESSITA ESCLARECIMENTO`.

### 5. Fase 1 — Design

Gere, conforme a feature exigir:

- **`data-model.md`** — entidades, campos, relações, migrações SQL.
  O schema base está em `packages/loot-core/src/server/sql/init.sql` e as
  migrações em `packages/loot-core/migrations/`.
- **`contracts/`** — contratos de API/IPC/MCP: request, response, erros.
- **`quickstart.md`** — como rodar e ver a feature funcionando de ponta a ponta.

### 6. Reavalie a Constituição

Refaça a Verificação da Constituição **após o design**. O design pode ter
introduzido violações que o contexto inicial não tinha. Registre o resultado da
2ª avaliação no plano.

### 7. Relate

Resuma a abordagem escolhida, os artefatos gerados e o resultado dos portões.
Sugira `/speckit.checklist` (opcional) ou `/speckit.tasks`.
