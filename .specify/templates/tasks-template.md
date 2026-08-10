# Tarefas: [NOME DA FEATURE]

**Spec**: `specs/[NNN-nome-da-feature]/spec.md`
**Plano**: `specs/[NNN-nome-da-feature]/plan.md`

## Formato

```
- [ ] T012 [P] [US1] Descrição da tarefa com o caminho do arquivo
```

- `T###` — id sequencial, contínuo em todas as fases.
- `[P]` — pode rodar em paralelo (arquivos diferentes, sem dependência entre si).
- `[US#]` — a que história de usuário pertence. **Só** nas fases de história; Setup, Fundação e Polimento não levam rótulo.
- Toda tarefa DEVE citar o caminho do arquivo que ela toca.

Correto: `- [ ] T012 [P] [US1] Criar normalizador de descrição em packages/loot-core/src/custom/classify/normalize.ts`
Errado: `- [ ] T001 [US1] Criar normalizador` _(sem caminho de arquivo)_

> **Testes**: neste repositório, o princípio VII da constituição torna teste
> obrigatório para toda lógica custom. Gere as tarefas de teste antes das de
> implementação dentro de cada história — elas DEVEM ser escritas e falhar antes.

<!-- APAGUE as tarefas de exemplo abaixo ao gerar o tasks.md real. -->

---

## Fase 1 — Setup (infraestrutura compartilhada)

- [ ] T001 [descrição com caminho]

---

## Fase 2 — Fundação (pré-requisito bloqueante)

> **⚠️ CRÍTICO**: nenhuma história pode começar antes desta fase terminar.

- [ ] T00X [descrição com caminho]

**Checkpoint**: fundação pronta — as histórias podem começar em paralelo.

---

## Fase 3 — História 1: [Título] (P1) 🎯 MVP

**Objetivo**: [o que o usuário consegue fazer ao fim desta fase]
**Teste independente**: [como validar essa história sozinha]

### Testes da História 1

- [ ] T0XX [P] [US1] [teste que falha primeiro, com caminho]

### Implementação da História 1

- [ ] T0XX [P] [US1] [descrição com caminho]

**Checkpoint**: História 1 funcional e testável de forma independente.

---

## Fase 4 — História 2: [Título] (P2)

_(mesma estrutura)_

**Checkpoint**: Histórias 1 e 2 funcionais.

---

## Fase 5 — História 3: [Título] (P3)

_(mesma estrutura)_

---

## Fase N — Polimento e Transversais

- [ ] T0XX i18n de todas as strings novas
- [ ] T0XX Atualizar `infra/README.md` / `CLAUDE.md` se o fluxo operacional mudou
- [ ] T0XX `yarn typecheck && yarn lint && yarn test` verdes

---

## Dependências e Ordem de Execução

### Entre fases

Setup → Fundação → Histórias (P1 → P2 → P3) → Polimento

### Entre histórias

[quais histórias dependem de quais; idealmente nenhuma]

### Dentro de cada história

Testes → modelos/dados → serviços → endpoints/UI → integração

### Oportunidades de paralelismo

[quais tarefas `[P]` podem rodar juntas]

---

## Estratégia de Entrega

- **MVP primeiro**: entregar só a História 1 (P1) e usar de verdade antes de seguir.
- **Entrega incremental**: cada história vira um checkpoint utilizável.

---

## Notas

- Commits: `[AI] descrição`.
- Não marcar tarefa como feita com teste vermelho.
