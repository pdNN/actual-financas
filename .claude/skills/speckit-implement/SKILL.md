---
name: speckit-implement
description: Executa tasks.md fase por fase, implementando a feature ativa com testes primeiro e portão de qualidade verde. Passo de execução do fluxo SDD do actual-financas. Use após /speckit.tasks ou ao invocar /speckit.implement.
argument-hint: "(opcional) fase ou história a executar, ex.: 'só a US1'"
user-invocable: true
---

# /speckit.implement — Implementar

Escopo opcional do usuário: `$ARGUMENTS`

## Objetivo

Executar `tasks.md` de forma disciplinada, sem sair do que a spec definiu.

## Passos

### 1. Prepare

```bash
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
```

Leia: `tasks.md`, `plan.md`, `spec.md`, os documentos de design disponíveis e
`.specify/memory/constitution.md`.

### 2. Portão dos checklists

Antes de escrever código, verifique `FEATURE_DIR/checklists/`. Se houver item
crítico em aberto — sobretudo em `requirements.md` — pare e resolva com o usuário.
Implementar sobre spec ambígua produz retrabalho.

### 3. Execute fase por fase

Respeite a ordem: Setup → Fundação → histórias em ordem de prioridade → Polimento.

**Não pule a Fundação.** Ela é bloqueante por construção.

Dentro de cada história:

1. Escreva o teste. **Rode e veja falhar.**
2. Implemente o mínimo para passar.
3. Rode o teste. Veja passar.
4. Refatore com o teste verde.
5. Marque a tarefa `- [x]` em `tasks.md`.

Tarefas `[P]` do mesmo bloco podem ser feitas em sequência rápida, já que tocam
arquivos diferentes.

**Nunca marque tarefa como feita com teste vermelho.** Se travou, deixe a tarefa
aberta, registre o bloqueio e traga ao usuário.

### 4. Regras não-negociáveis deste repositório

- **Princípio II** — código novo em diretório custom. Se precisar editar arquivo
  do upstream, use os marcadores `// >>> CUSTOM: … / // <<< CUSTOM` e confirme que
  aquele arquivo está listado no plano.
- **Princípio VI** — toda string de usuário via `Trans`/`useTranslation`; números
  financeiros com `FinancialText` ou `styles.tnum`.
- **Princípio VII** — sem novos `@ts-strict-ignore`, `eslint-disable`, `any`.
- **Princípio VIII** — nada de PII em log; chave de API só no servidor.

### 5. Portão de qualidade

Ao final de cada fase:

```bash
yarn typecheck && yarn lint && yarn test
```

Tem que estar verde antes de seguir para a próxima fase. Rodar sempre da raiz do
repositório.

### 6. Checkpoint de história

Ao terminar uma história, pare e diga ao usuário o que já dá para usar. O valor
do desenho por história é justamente poder parar no meio.

### 7. Habilidades auxiliares

Durante a implementação você pode usar as skills `sdd-tdd`, `sdd-verify` e
`sdd-simplify` para conduzir o ciclo vermelho-verde e a limpeza — **desde que
apontem para `specs/NNN-*/spec.md`**, e nunca para `docs/specs/`, que não é a
convenção deste repositório.

Não use `sdd-feature` nem `sdd-interview-to-spec`: aqui esse papel é do
`/speckit.specify` e do `/speckit.clarify`.

### 8. Relate

Resuma o que foi implementado, o estado do portão de qualidade e o que sobrou.
Sugira `/speckit.converge` se restou trabalho, ou abertura de PR se está pronto.
