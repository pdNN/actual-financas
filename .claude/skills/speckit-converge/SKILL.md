---
name: speckit-converge
description: Compara o código real com spec, plano e tarefas da feature ativa e acrescenta em tasks.md uma fase de convergência com o que falta. Use ao invocar /speckit.converge, ou quando a implementação divergiu do que foi especificado.
argument-hint: "(opcional) área a convergir"
user-invocable: true
---

# /speckit.converge — Convergir código e especificação

Foco opcional do usuário: `$ARGUMENTS`

## Objetivo

Descobrir a distância entre o que a spec pediu e o que o código realmente faz,
e transformar essa distância em tarefas.

## Passos

### 1. Carregue

```bash
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
```

Leia `spec.md`, `plan.md`, `tasks.md`, os documentos de design e a constituição.

### 2. Inspecione o código de verdade

Não confie nos `- [x]` do `tasks.md`. Vá ao código:

- Cada requisito funcional (`RF-###`) está de fato implementado? Onde?
- Cada critério de sucesso (`CS-###`) é atingível pelo que existe hoje?
- Os testes cobrem os cenários de aceitação da spec?
- `yarn typecheck && yarn lint && yarn test` estão verdes?

### 3. Verifique a constituição contra o código

A constituição é **inegociável**. Código que viola um princípio **DEVE** é o
achado de maior severidade e gera tarefa de remediação obrigatória.

Se a constituição ainda for um template não preenchido, pule esta verificação
com uma nota — não falhe por causa disso.

### 4. Acrescente a fase de convergência

Em `tasks.md`, **acrescente ao final** uma seção:

```markdown
## Fase N: Convergência

- [ ] T0XX [descrição com caminho do arquivo]
```

**Append-only.** Não reescreva, não renumere e não remova nada do que já está lá —
o histórico do `tasks.md` é registro do que foi feito.

Ordene as tarefas por severidade: violações de constituição primeiro, depois
requisitos sem implementação, depois lacunas de teste, depois polimento.

### 5. Relate

Diga quantos requisitos estão completos, quantos parciais e quantos ausentes;
liste as violações de constituição encontradas; e informe quantas tarefas de
convergência foram acrescentadas.

Se nada divergiu, diga isso claramente — a feature está pronta para PR.
