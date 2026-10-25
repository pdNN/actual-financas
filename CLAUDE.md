@AGENTS.md
@.github/agents/pr-and-commit-rules.md

# CLAUDE.md — actual-financas

> **A fonte de verdade das regras é `.specify/memory/constitution.md`.**
> Este arquivo é o resumo operacional. Onde houver conflito, a constituição vence.
> Leia-a antes de qualquer trabalho não-trivial.

## O que é este projeto

Sistema de finanças pessoais do **Pedro e da Julia** (casal), construído sobre um
**fork de [actualbudget/actual](https://github.com/actualbudget/actual)** (base v26.3.0).
BRL, pt-BR. Hospedado em GCP Compute Engine `e2-micro` com SQLite local e Caddy.

**O problema que ele existe para resolver**: as receitas foram cadastradas, as
despesas nunca. O gargalo é o **atrito de registro**. Julgue toda feature por
quanto ela reduz esse atrito.

Visão de produto, histórias e backlog: `specs/000-produto/spec.md`.

---

## Regra número 1 — Spec antes de código

**Toda mudança de comportamento nasce como especificação.** Se o usuário pedir
uma feature e não houver spec, seu primeiro passo é `/speckit.specify`, não
abrir um arquivo `.ts`.

### Fluxo

```
/speckit.constitution   # só quando as regras do projeto mudarem
/speckit.specify        # cria specs/NNN-slug/spec.md + branch NNN-slug
/speckit.clarify        # até 5 perguntas, uma por vez
/speckit.plan           # plan.md + research.md + design; portão da constituição
/speckit.checklist      # opcional — "testes unitários para o português"
/speckit.tasks          # tasks.md por história de usuário
/speckit.analyze        # opcional — consistência entre os artefatos
/speckit.implement      # executa, com teste primeiro
/speckit.converge       # o que o código ainda deve à spec
/speckit.status         # onde estamos
```

### Exceções — pode ir direto ao código

1. Correção de texto/comentário/typo, sem mudança de comportamento.
2. Bump de dependência sem mudança de comportamento observável.
3. Merge de upstream e resolução dos conflitos dele.
4. Mudanças restritas a `infra/`.
5. Hotfix de produção — **mas** a spec é obrigatória em retrospecto, antes do merge seguinte.

Qualquer outra coisa exige spec. Na dúvida, exige spec.

### Convenção de artefatos

Especificações vivem em **`specs/NNN-slug/`**. **Não use `docs/specs/`** — é
convenção de outra ferramenta e fragmentaria a fonte de verdade.

As skills `sdd-tdd`, `sdd-verify` e `sdd-simplify` podem ser usadas dentro do
`/speckit.implement` para conduzir o ciclo vermelho-verde, desde que apontem para
`specs/NNN-*/spec.md`. Não use `sdd-feature` nem `sdd-interview-to-spec` — aqui
esse papel é do `/speckit.specify` e do `/speckit.clarify`.

---

## Regra número 2 — Não quebre o merge com o upstream

Este é um fork vivo. Quebrar o merge de upstream é falha crítica.

- Código novo vai em diretório custom: `packages/custom/`,
  `packages/loot-core/src/custom/`, `packages/desktop-client/src/components/custom/`,
  `packages/sync-server/src/custom/`.
- Editar arquivo do upstream é último recurso, e sempre cercado por:

  ```ts
  // >>> CUSTOM: actual-financas — [descrição]
  // <<< CUSTOM
  ```

- Nunca deletar, renomear ou reestruturar arquivo do upstream.
- Em `package.json`: só **adicionar** dependências.

`CLAUDE.md` e `AGENTS.md` são exceções assumidas — pertencem ao fork; em conflito,
mantenha a versão do fork.

---

## Regra número 3 — Determinístico antes de IA

Ordem obrigatória para classificar transação:

1. Regras nativas do Actual — `packages/loot-core/src/server/rules/` e o
   aprendizado por payee em `packages/loot-core/src/server/transactions/transaction-rules.ts`
   (`getProbableCategory`, `updateCategoryRules`, flag `learn_categories`).
2. Cache de descrição normalizada.
3. IA, só no que sobrou.

No processamento **automático** (importação, lote, segundo plano), saída de IA é
**sugestão revisável** — nunca grava categoria sozinha sem confirmação ou sem
confiança acima do limiar. Todo acerto confirmado realimenta a camada determinística.

Exceção declarada (III-b, emenda 2.0.0): o **assistente conversacional** do casal
(Claude, via MCP financeiro) pode decidir gravar, avaliando as mensagens de risco que
a ferramenta devolve — sem confirmação, limiar, teto nem desfazer impostos pelo
servidor. Só vale com as sete condições do III-b (risco declarado e calculado pelo
servidor, instruções contra injeção, auditoria sem PII, revogação e interruptor,
identidade, riscos aceitos na spec). Não se estende ao processamento automático.

> **A classificação por IA existente está DESLIGADA por padrão.** Ela é anterior
> à constituição e viola os princípios III, IV e VII. O código foi mantido porque
> é o ponto de partida da feature `003`, que vai reconstruí-la. Para ligar:
> `ACTUAL_AI_CLASSIFICATION_ENABLED=true` no servidor, além da credencial.
> Ter só a credencial **não** liga. Ver `specs/001-desligar-padrao-enriquecimento/spec.md`.

Provider de IA é **plugável e configurável**, nunca hardcoded. Chamadas sempre em
lote. Sem modelo local na VM.

---

## Comandos

Sempre da **raiz** do repositório:

```bash
yarn typecheck         # tsgo + lage typecheck — obrigatório antes de commitar
yarn lint              # oxfmt --check + oxlint --type-aware
yarn lint:fix          # auto-corrige
yarn test              # todos os pacotes, via lage
yarn start             # frontend em :3001
yarn start:server-dev  # sync-server :5006 + frontend
```

Node 24 (ver `.nvmrc`), Yarn ^4.9.1. Sempre da raiz do repositório.

**Portão de qualidade** (princípio VII): `yarn typecheck && yarn lint && yarn test`
verde antes de qualquer commit.

---

## Git

- Branch por feature, formato `NNN-slug`, criada pelo `/speckit.specify`.
- **Todo commit e todo título de PR começa com `[AI] `.**
- PR sempre em rascunho (draft).
- Nunca `--force`, `reset --hard` em trabalho publicado, ou `--no-verify`.
- Não commitar sem o usuário pedir.

---

## Restrições que doem na prática

| Restrição                             | Consequência                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VM `e2-micro`, 384MB para o container | Nada de dependência pesada no `sync-server`. OCR, backfill e lote grande rodam fora da VM.                                                                                           |
| SQLite local                          | Sem banco externo.                                                                                                                                                                   |
| pt-BR / BRL                           | Toda string de usuário via `Trans`; números com `FinancialText` ou `styles.tnum`.                                                                                                    |
| Privacidade — IA                      | Descrição, valor, data e categoria **podem** ir para provider de IA. Conta, cartão, CPF, credencial e senha **nunca**. Log sem PII. Chave de API só no servidor.                     |
| Privacidade — Open Finance            | Agregador regulado (Pluggy) **pode** receber conta, cartão, saldo e extrato, com consentimento dado no banco e revogável. Senha e token do banco **nunca** passam pelo nosso código. |
| Qualidade                             | Sem novos `@ts-strict-ignore`, `eslint-disable`, `any`, `unknown` sem justificativa no plano.                                                                                        |

---

## Onde olhar

| Arquivo                                      | O que é                                                    |
| -------------------------------------------- | ---------------------------------------------------------- |
| `.specify/memory/constitution.md`            | **As regras. Autoridade máxima.**                          |
| `specs/000-produto/spec.md`                  | Visão de produto, histórias e backlog                      |
| `specs/NNN-slug/`                            | Especificações de feature                                  |
| `AGENTS.md`                                  | Guia técnico do repositório (arquitetura, padrões, testes) |
| `CODE_REVIEW_GUIDELINES.md`                  | Padrões de revisão                                         |
| `infra/README.md`                            | Runbook de deploy no GCP                                   |
| `packages/sync-server/src/app-ai/app-ai.ts`  | Classificador de transações atual (Gemini)                 |
| `packages/loot-core/src/server/rules/`       | Motor de regras nativo do Actual                           |
| `packages/loot-core/src/server/sql/init.sql` | Schema base do banco                                       |

<!-- SPECKIT START -->
<!-- SPECKIT END -->
