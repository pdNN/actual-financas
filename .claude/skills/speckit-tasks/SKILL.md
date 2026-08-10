---
name: speckit-tasks
description: Gera tasks.md — lista de tarefas ordenada por dependência e organizada por história de usuário — a partir da spec e do plano da feature ativa. Quarto passo do fluxo SDD do actual-financas. Use após /speckit.plan ou ao invocar /speckit.tasks.
argument-hint: "(opcional) foco, ex.: 'só a história P1'"
user-invocable: true
---

# /speckit.tasks — Gerar as tarefas

Foco opcional do usuário: `$ARGUMENTS`

## Objetivo

Quebrar o plano em tarefas executáveis, agrupadas por história de usuário, de
modo que cada história possa ser entregue de forma independente.

## Passos

### 1. Prepare

```bash
.specify/scripts/bash/setup-tasks.sh --json
```

Devolve `FEATURE_DIR`, `AVAILABLE_DOCS`, `TASKS_TEMPLATE`, `TASKS`.
O script falha se `spec.md` ou `plan.md` não existirem — é o portão correto.

Leia `spec.md`, `plan.md`, todos os `AVAILABLE_DOCS` e a constituição.

### 2. Escreva `tasks.md`

Use o `TASKS_TEMPLATE` como estrutura. **Apague as tarefas de exemplo dele.**

Estrutura obrigatória:

- **Fase 1 — Setup**: infraestrutura compartilhada.
- **Fase 2 — Fundação**: pré-requisito bloqueante. Nenhuma história começa antes.
- **Uma fase por história**, em ordem de prioridade. A P1 leva o marcador 🎯 MVP.
- **Fase final — Polimento**: i18n, documentação, portão de qualidade.

Formato de cada linha:

```
- [ ] T012 [P] [US1] Descrição com o caminho do arquivo
```

- `T###` sequencial e contínuo entre as fases.
- `[P]` só quando a tarefa toca arquivos diferentes e não depende de outra em andamento.
- `[US#]` **só** nas fases de história. Setup, Fundação e Polimento não levam rótulo.
- **Toda tarefa cita o caminho do arquivo.** Tarefa sem caminho é tarefa mal escrita.

### 3. Testes são obrigatórios aqui

O template original do spec-kit trata testes como opcionais. **Neste
repositório não são**: o princípio VII da constituição exige teste Vitest para
toda lógica custom.

Dentro de cada história, gere as tarefas de teste **antes** das de implementação,
e deixe explícito que elas devem falhar primeiro.

### 4. Ordem dentro de cada história

Testes → modelos/migrações → serviços → endpoints/UI → integração.

### 5. Preencha as seções finais

- **Dependências e Ordem de Execução** — entre fases, entre histórias, dentro de cada história.
- **Oportunidades de paralelismo** — quais tarefas `[P]` rodam juntas.
- **Estratégia de Entrega** — MVP primeiro; cada história é um checkpoint utilizável.

### 6. Relate

Informe: total de tarefas, quantas por história, qual é o corte do MVP, e o
caminho de `tasks.md`. Sugira `/speckit.analyze` antes de implementar.
