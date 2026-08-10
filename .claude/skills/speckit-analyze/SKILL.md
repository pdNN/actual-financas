---
name: speckit-analyze
description: Relatório somente-leitura de consistência e cobertura entre spec, plano, tarefas e constituição da feature ativa. Portão de qualidade opcional do fluxo SDD do actual-financas. Use antes de implementar ou ao invocar /speckit.analyze.
argument-hint: "(opcional) foco da análise"
user-invocable: true
---

# /speckit.analyze — Analisar consistência

Foco opcional do usuário: `$ARGUMENTS`

## Objetivo

Encontrar incoerências entre `spec.md`, `plan.md`, `tasks.md` e a constituição
**antes** que virem código errado.

> **Este comando é SOMENTE LEITURA.** Não edite nenhum arquivo. Produza um
> relatório e deixe a correção para o usuário decidir.

## Passos

### 1. Carregue tudo

```bash
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
```

Leia `spec.md`, `plan.md`, `tasks.md`, os documentos de design e
`.specify/memory/constitution.md`.

### 2. Autoridade da constituição

A constituição é **inegociável** dentro desta análise. Conflito com ela é
automaticamente **CRÍTICO** e exige ajuste da spec, do plano ou das tarefas —
nunca diluição, reinterpretação ou omissão do princípio.

### 3. Verifique

**Cobertura:**
- Todo requisito funcional (`RF-###`) tem ao menos uma tarefa que o realiza?
- Toda história tem tarefas suficientes para ser entregue sozinha?
- Todo critério de sucesso (`CS-###`) é verificável pelo que foi planejado?
- Toda tarefa rastreia até algum requisito? (tarefa órfã = escopo inflado)

**Consistência:**
- O plano contradiz a spec em algum ponto?
- As tarefas implementam algo que a spec não pediu?
- Os nomes de entidade batem entre `spec.md`, `data-model.md` e as tarefas?

**Qualidade:**
- Sobrou `[NECESSITA ESCLARECIMENTO]`?
- Há requisito não-testável?
- Há critério de sucesso sem número?
- Há tarefa sem caminho de arquivo?
- Testes foram gerados antes da implementação em cada história? (princípio VII)

**Constituição** — um a um, do I ao VIII.

### 4. Classifique cada achado

| Severidade | Critério |
|---|---|
| **CRÍTICO** | Viola um DEVE/NÃO DEVE da constituição, ou requisito central sem nenhuma cobertura |
| **ALTO** | Contradição direta entre artefatos, ou história que não fecha sozinha |
| **MÉDIO** | Ambiguidade que provavelmente gera retrabalho |
| **BAIXO** | Inconsistência de nomenclatura ou de estilo |

### 5. Relate

Tabela com: severidade, onde (arquivo e seção), o que está errado, e a correção
sugerida. Ordene do mais severo para o menos.

Se não houver nada CRÍTICO nem ALTO, diga claramente que está liberado para
`/speckit.implement`.
