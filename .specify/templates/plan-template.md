# Plano de Implementação: [NOME DA FEATURE]

**Branch**: `[NNN-nome-da-feature]`
**Data**: [DATA]
**Spec**: `specs/[NNN-nome-da-feature]/spec.md`

---

## Resumo

[2-4 frases: o que vai ser construído e qual a abordagem técnica escolhida.]

---

## Contexto Técnico

<!-- Marque como NECESSITA ESCLARECIMENTO tudo que ainda não está resolvido. -->

| Item | Valor |
|---|---|
| **Linguagem / versão** | TypeScript, Node >= 22 |
| **Dependências principais** | [ex.: React 19, Express, better-sqlite3, …] |
| **Armazenamento** | SQLite (better-sqlite3), via AQL / `loot-core` |
| **Testes** | Vitest (`*.test.ts` ao lado do fonte); Playwright para e2e |
| **Plataforma alvo** | Navegador (PWA) + `sync-server` em GCE e2-micro |
| **Tipo de projeto** | Monorepo Yarn 4 workspaces, orquestrado por lage |
| **Metas de performance** | [ex.: classificar 300 transações em < 30s] |
| **Restrições** | 384MB de RAM no container; sem dependência pesada no `sync-server` |
| **Escala / escopo** | 2 usuários, ~[N] transações/mês |
| **Pacotes tocados** | [ex.: `packages/loot-core`, `packages/desktop-client`] |

---

## Verificação da Constituição

> **PORTÃO: deve passar antes da Fase 0. Reavaliar após a Fase 1.**
> Fonte: `.specify/memory/constitution.md`. Conflito com a constituição é
> sempre CRÍTICO — corrige-se a spec/plano/tasks, nunca se dilui o princípio.

<!-- Derive os itens abaixo dos princípios vigentes na constituição. -->

- [ ] **I — Especificação antes de código**: existe `spec.md` aprovada para esta feature.
- [ ] **II — Compatibilidade com upstream**: código novo em diretório custom; edições em arquivos do upstream, se houver, usam os marcadores `>>> CUSTOM` / `<<< CUSTOM` e estão listadas aqui.
- [ ] **III — Determinístico antes de IA**: a camada determinística foi tentada primeiro; a IA só atua no residual; saída de IA é sugestão revisável.
- [ ] **IV — IA plugável e barata**: nenhum provider hardcoded; chamadas em lote; custo por lote observável.
- [ ] **V — Orçamento da VM**: nada de dependência pesada no `sync-server`; trabalho caro roda fora da VM.
- [ ] **VI — pt-BR e BRL**: strings de usuário via i18n; números financeiros com `FinancialText`/`styles.tnum`.
- [ ] **VII — Teste para lógica custom**: cada comportamento novo tem teste Vitest.
- [ ] **VIII — Privacidade explícita**: nenhum dado proibido sai da máquina; log sem PII.

**Resultado da 1ª avaliação (pré-Fase 0)**: [PASSOU / VIOLAÇÕES — ver Complexidade]
**Resultado da 2ª avaliação (pós-Fase 1)**: [PASSOU / VIOLAÇÕES — ver Complexidade]

---

## Estrutura do Projeto

### Documentação desta feature

```
specs/[NNN-nome-da-feature]/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/           # Fase 1
├── tasks.md             # /speckit.tasks
└── checklists/
    └── requirements.md
```

### Código-fonte

```
packages/
├── loot-core/src/custom/…        # lógica de negócio custom
├── desktop-client/src/components/custom/…   # UI custom
├── sync-server/src/custom/…      # endpoints custom
└── custom/…                      # pacotes independentes (ex.: MCP server)
```

**Decisão de estrutura**: [onde o código desta feature vai morar e por quê]

---

## Fase 0 — Pesquisa → `research.md`

Resolver todo `NECESSITA ESCLARECIMENTO` do Contexto Técnico. Para cada questão:

```
Decisão: [o que foi escolhido]
Justificativa: [por quê]
Alternativas consideradas: [o que mais foi avaliado e por que foi descartado]
```

---

## Fase 1 — Design → `data-model.md`, `contracts/`, `quickstart.md`

- **`data-model.md`**: entidades, campos, relações, migrações SQL necessárias.
- **`contracts/`**: contratos de API/IPC/MCP — request, response, erros.
- **`quickstart.md`**: como rodar e ver a feature funcionando de ponta a ponta.

Ao final, **reavaliar a Verificação da Constituição**.

---

## Rastreamento de Complexidade

> **Preencher SOMENTE se a Verificação da Constituição tiver violações que precisam de justificativa.**

| Violação | Por que é necessária | Por que a alternativa mais simples foi rejeitada |
|---|---|---|
| | | |
