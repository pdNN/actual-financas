---
name: speckit-status
description: Mostra o estado do fluxo SDD — qual feature está ativa, quais artefatos existem, o que falta e qual é o próximo comando. Use ao invocar /speckit.status, ao retomar um trabalho, ou quando não souber em que ponto do fluxo você está.
argument-hint: ""
user-invocable: true
---

# /speckit.status — Onde estamos no fluxo

## Objetivo

Responder rapidamente: qual feature está ativa, o que já foi produzido e qual é
o próximo passo.

## Passos

### 1. Descubra a feature ativa

```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```

Se o comando falhar com "nenhuma feature ativa", não há trabalho SDD em
andamento. Liste o que existe em `specs/` e sugira `/speckit.specify`.

### 2. Levante o estado

Verifique quais destes existem no `FEATURE_DIR`:

| Arquivo | Produzido por | Significa |
|---|---|---|
| `spec.md` | `/speckit.specify` | a demanda está escrita |
| `checklists/requirements.md` | `/speckit.specify` | a spec tem checklist de qualidade |
| `research.md` | `/speckit.plan` (Fase 0) | decisões técnicas registradas |
| `data-model.md`, `contracts/`, `quickstart.md` | `/speckit.plan` (Fase 1) | design pronto |
| `plan.md` | `/speckit.plan` | abordagem técnica definida |
| `tasks.md` | `/speckit.tasks` | trabalho quebrado em tarefas |

Em `tasks.md`, conte tarefas totais, feitas (`- [x]`) e pendentes, por fase.

Em `spec.md`, conte marcadores `[NECESSITA ESCLARECIMENTO]` remanescentes.

### 3. Estado do repositório

```bash
git rev-parse --abbrev-ref HEAD
git status --short
```

Verifique se a branch atual corresponde à feature ativa (`NNN-slug`). Se não
corresponder, avise — é sinal de que o `feature.json` ficou apontando para outra coisa.

### 4. Relate

Um resumo curto:

- **Feature ativa**: `NNN-slug` — título
- **Branch**: nome, e se bate com a feature
- **Artefatos**: quais existem, quais faltam
- **Progresso**: X de Y tarefas, quais fases fechadas
- **Bloqueios**: esclarecimentos pendentes, tarefas travadas, testes vermelhos
- **Próximo comando**: o comando exato a rodar agora

Ordem de referência do fluxo:
`/speckit.constitution` → `/speckit.specify` → `/speckit.clarify` →
`/speckit.plan` → `/speckit.checklist` → `/speckit.tasks` →
`/speckit.analyze` → `/speckit.implement` → `/speckit.converge`
