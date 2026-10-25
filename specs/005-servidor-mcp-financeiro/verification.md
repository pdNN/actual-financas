# Verificação: Servidor MCP financeiro (somente leitura)

Registro de execução das tarefas de verificação de `tasks.md`.

## Setup

- **T003** (2026-10-19): `corepack yarn install` com o workspace `@actual-financas/custom`. Diff de `yarn.lock`: **+9 linhas, só aditivo** (entrada do workspace novo).
- **T004** (2026-10-19): o `vitest.config.ts` da raiz lista `projects` por glob `packages/*/vitest.config.{ts,mts}`. O pacote novo **não tem** `vitest.config`, então não entra nesse glob e **não exige edição do arquivo**; o `lage` o descobre pelo script `test` do próprio pacote (`yarn test` da raiz roda via lage).

## Fundação

- **T005 / T006 / S-1** (2026-10-19): spikes por documentação e inspeção do pacote; resultados em `research.md`, seção "Resultados dos spikes". Confirmação prática do comportamento dos hooks dentro do Claude Code fica na T024.
- **T012 — vermelho** (2026-10-19): os cinco arquivos de teste (`launch`, `mask-pii`, `hook-mask`, `tool-surface`, `agent-config`) falharam antes de qualquer implementação (módulos inexistentes).
- **T019 — verde** (2026-10-19): `@actual-financas/custom` com 5 arquivos e **49 testes passando**; `corepack yarn typecheck` (8 sucessos, 0 falhas) e `corepack yarn lint` limpos. O `lint:fix` também reformatou os documentos da própria spec 005.
- **Fumaça fora do Claude** (2026-10-19), pelo terminal, sem segredo: `hook-mask.mjs` troca `123.456.789-09` por `[CPF]`; fica mudo quando a resposta é limpa; suprime a resposta se a entrada for inválida (falha fechada). `hook-guard.mjs` nega `actual_transactions_update` e deixa passar `actual_accounts_list`. O lançador, sem itens no Chaveiro, para com `[missing-url]` e exit 1, sem imprimir segredo. Isso comprova que o Node executa os `.mjs` que importam `.ts`.

## Servidor próprio (emenda D-1, Fase 2B)

- **T040–T046** (2026-10-25): servidor MCP próprio em `packages/custom/mcp-financeiro/` (`src/analysis.ts`, `source.ts`, `server.ts`, `bin/servidor.mjs`); lançador (`launch.ts`, `bin/actual-mcp-financeiro.mjs`) lê `url`, `sync-id` e `session-token` do Chaveiro (e `budget-password`, opcional); subagente e `tool-surface.ts` com as 7 ferramentas de leitura (`contas`, `categorias`, `gasto_por_categoria`, `comparar_periodos`, `transacoes`, `sem_categoria`, `fluxo_e_sobra`).
- **Fumaça do processo real** (2026-10-25), por stdio, Node 22.23 e 24.18, sem dado real: `initialize` responde; `tools/list` devolve as 7 ferramentas; `tools/call` com o Actual inacessível (porta fechada), com token expirado (`token-expired`) e com resposta que não é JSON devolve `isError` com mensagem tratada ("servidor do Actual está inacessível" / "token de sessão ... expirou ou é inválido"); o token fictício não aparece em stdout nem em stderr. Passou a ser teste permanente: `src/servidor.smoke.test.ts`.
- **Sobre o "exit 1 sem handshake"** relatado antes: não reproduzível com o código atual nas três falhas acima. O único caminho que produz exit 1 sem responder ao `initialize` é subir `bin/servidor.mjs` **sem** `ACTUAL_SERVER_URL`, `ACTUAL_SESSION_TOKEN` ou `ACTUAL_BUDGET_SYNC_ID` ("Configuração incompleta: use actual-mcp-financeiro.mjs"); isso agora tem teste (`servidor.smoke.test.ts`, segundo caso). O script de fumaça antigo foi perdido, então a causa exata daquela execução não pôde ser confirmada; a hipótese mais provável é variável de ambiente ausente no script.

## Passo a passo para o Pedro (T023/T024 — não executados aqui)

1. **Token de sessão.** Abra o Actual de produção no navegador, já logado; no console (F12) rode o script da seção "Como obter o token de sessão" da emenda D-1 em `research.md` e copie o valor impresso.
2. **Chaveiro.** No Terminal (o `-w` sem valor pede o dado sem deixá-lo no histórico):

   ```bash
   security add-generic-password -s actual-financas-mcp -a url -w 'https://SEU-DOMINIO'
   security add-generic-password -s actual-financas-mcp -a sync-id -w 'SEU-SYNC-ID'
   security add-generic-password -s actual-financas-mcp -a session-token -w
   ```

   (Cole o token quando pedir. Se o orçamento tiver criptografia, acrescente `-a budget-password`.)

3. **Perguntar.** Abra o Claude Code na raiz do repositório e escreva: `@assistente-financeiro quanto gastamos por categoria em setembro?`
4. **Prova da máscara (T024).** Com o orçamento de teste (quickstart, "Orçamento de teste") perguntando `@assistente-financeiro quais foram os maiores gastos de Lazer em setembro?`: a linha do `PIX JOAO` deve aparecer com `[CPF]` no lugar de `123.456.789-09`.
