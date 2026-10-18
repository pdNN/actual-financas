# Tarefas: Servidor MCP financeiro (somente leitura)

**Spec**: `specs/005-servidor-mcp-financeiro/spec.md`
**Plano**: `specs/005-servidor-mcp-financeiro/plan.md`

## Formato

```
- [ ] T012 [P] [US1] Descrição da tarefa com o caminho do arquivo
```

- `T###` — id sequencial, contínuo em todas as fases.
- `[P]` — pode rodar em paralelo (arquivos diferentes, sem dependência entre si).
- `[US#]` — história de usuário. Só nas fases de história.
- `[Pedro]` — precisa da máquina, das credenciais ou do orçamento real do Pedro; não dá para fazer só com o repositório.

> **Testes**: princípio VII. Em cada fase, os testes vêm **antes** da implementação
> e DEVEM falhar primeiro (T012 registra o vermelho).
>
> **Duas espécies de teste aqui**: (1) Vitest para a lógica executável (lançador,
> máscara, lista de ferramentas, hooks, configuração do subagente); (2) verificação
> guiada contra um orçamento de teste para o comportamento do subagente, que é
> texto de instrução e não código. A segunda é registrada em `verification.md`.

> **Correção ao plano**: o `package.json` do pacote custom fica em
> `packages/custom/package.json`, não em `packages/custom/mcp-financeiro/`. O
> workspace da raiz é `packages/*` (um nível), então `packages/custom` é o
> pacote; `mcp-financeiro/` vira uma pasta de código dentro dele. Ajuste feito
> em `plan.md`.

---

## Fase 1 — Setup (infraestrutura compartilhada)

- [ ] T001 Criar o pacote de workspace `packages/custom/package.json` (`name: "@actual-financas/custom"`, `private: true`, `type: "module"`, scripts `test: "vitest --run"` e `typecheck: "tsgo -b"`, `devDependencies` de `vitest` na mesma faixa de `packages/crdt/package.json`)
- [ ] T002 [P] Criar `packages/custom/tsconfig.json` no molde de `packages/crdt/tsconfig.json`, com `include: ["./mcp-financeiro/src/"]` e `rootDir: "./mcp-financeiro/src"`
- [ ] T003 Rodar `corepack yarn install` na raiz e conferir que o diff de `yarn.lock` é **só aditivo** (entrada do workspace novo); registrar o resultado em `verification.md`
- [ ] T004 [P] Ler `vitest.config.ts` da raiz e confirmar se `projects` precisa listar o pacote novo; se precisar, **não editar** — usar o script `test` do próprio pacote (o lage o descobre) e anotar a decisão em `verification.md`

---

## Fase 2 — Fundação (pré-requisito bloqueante)

> **⚠️ CRÍTICO**: nenhuma história começa antes disto. A fundação entrega o que
> é comum às três: somente leitura, máscara de dados sensíveis e o subagente
> vazio, mas já amarrado ao servidor.

### Spikes (resolvem o que pode mudar o desenho)

- [ ] T005 Spike S-1: com um servidor MCP de brinquedo em `.claude/worktrees/005-mcp/.scratch/` (fora do versionamento), provar que o cabeçalho de um subagente aceita `mcpServers` e `hooks`, que o `PostToolUse` troca a resposta via `updatedToolOutput` e que o `PreToolUse` nega uma ferramenta. Registrar formato exato de entrada/saída e a versão do Claude Code em `specs/005-servidor-mcp-financeiro/research.md` (seção "Resultados dos spikes"). **Se falhar**, aplicar o plano B do `research.md` (servidor em `.mcp.json` próprio + hooks em `settings.local.json` não versionado) e ajustar T018.
- [ ] T006 Baixar `actual-mcp-server@0.22.46` com `npm pack` em diretório novo do scratchpad (sem executar) e comparar os nomes reais das ferramentas com `specs/005-servidor-mcp-financeiro/contracts/tool-surface.md`; corrigir o contrato onde divergir

### Testes da Fundação (escrever primeiro; DEVEM falhar)

- [ ] T007 [P] `packages/custom/mcp-financeiro/src/launch.test.ts`: `buildLaunchSpec` (a) força `MCP_READ_ONLY=true` mesmo se o ambiente disser `false`; (b) recusa versão não fixada (faixa, `latest`); (c) inclui `--stdio`; (d) deixa a senha só no `env` do filho, nunca em `args` nem na descrição textual; (e) falta de credencial gera erro distinguível por causa (url, senha, sync id); (f) `MCP_TOOLS`/`MCP_TOOLSETS` derivam da lista fechada
- [ ] T008 [P] `packages/custom/mcp-financeiro/src/mask-pii.test.ts`: CPF com e sem pontuação → `[CPF]`; CNPJ → `[CNPJ]`; cartão de 13–19 dígitos **que passa em Luhn** → `[CARTAO]` e um que não passa fica intacto; `ag`/`agência`/`conta`/`cc` + dígitos → rótulo + `[NUM]`; **não altera** `R$ 1.234,56`, `-12345`, datas ISO, UUID; idempotente; entrada inesperada (null, número, objeto) não lança
- [ ] T009 [P] `packages/custom/mcp-financeiro/src/hook-mask.test.ts`: dado o JSON de entrada do `PostToolUse` (formato do T005), devolve o JSON de saída com o texto mascarado; falha interna → devolve a resposta original e **não** escreve o conteúdo no stderr
- [ ] T010 [P] `packages/custom/mcp-financeiro/src/tool-surface.test.ts`: nenhuma ferramenta permitida termina em sufixo de escrita; `decidePreToolUse` permite as listadas e nega qualquer outra do servidor (inclusive nome inventado); ferramentas de outros servidores não são afetadas
- [ ] T011 [P] `packages/custom/mcp-financeiro/src/agent-config.test.ts`: lê `.claude/agents/assistente-financeiro.md` e verifica (a) `tools` = lista permitida com o prefixo do servidor; (b) o servidor MCP usa o lançador e não traz segredo literal; (c) existem hooks `PreToolUse` e `PostToolUse` apontando para os binários; (d) existe a seção `## Definições` com a linha de sobra; (e) nenhuma ferramenta de escrita é citada como permitida
- [ ] T012 Rodar `corepack yarn workspace @actual-financas/custom test` e **registrar em `verification.md` que os cinco arquivos falham** (vermelho) antes de implementar

### Implementação da Fundação

- [ ] T013 `packages/custom/mcp-financeiro/src/tool-surface.ts`: `ALLOWED_TOOLS` (da lista de T006), `isAllowed`, `decidePreToolUse`
- [ ] T014 `packages/custom/mcp-financeiro/src/launch.ts`: `PINNED_VERSION = '0.22.46'`, `buildLaunchSpec(credentials)` puro, usando T013
- [ ] T015 `packages/custom/mcp-financeiro/src/mask-pii.ts`: máscara pura, com validação de Luhn
- [ ] T016 `packages/custom/mcp-financeiro/src/hook-mask.ts` e `packages/custom/mcp-financeiro/src/hook-guard.ts`: adaptadores finos de stdin/stdout para `PostToolUse` e `PreToolUse`
- [ ] T017 `packages/custom/mcp-financeiro/bin/actual-mcp-financeiro.mjs` (lê as três credenciais do Chaveiro com `security find-generic-password`, chama `buildLaunchSpec` e executa `npx` fixado) e `packages/custom/mcp-financeiro/bin/hook-mask.mjs` + `bin/hook-guard.mjs` (só chamam T016); nenhuma lógica nova nos `bin/`
- [ ] T018 `.claude/agents/assistente-financeiro.md`: cabeçalho (`name`, `description` em pt-BR, `tools`, `mcpServers`, `hooks`) e as seções vazias `## Papel`, `## Definições` (com a linha `sobra = receita − despesa (provisório)`), `## Protocolo de resposta` (copiar de `contracts/answer-protocol.md`), `## Recusas`
- [ ] T019 Rodar `corepack yarn workspace @actual-financas/custom test` (verde), `corepack yarn typecheck` e `corepack yarn lint`; registrar em `verification.md`

**Checkpoint**: servidor sobe só em leitura, resposta passa pela máscara, e o subagente existe. As histórias podem começar.

---

## Fase 3 — História 1: Perguntar para onde o dinheiro foi (P1) 🎯 MVP

**Objetivo**: perguntar gasto por categoria, comparação com o mês anterior e detalhe de uma categoria, com transferência fora da conta.
**Teste independente**: quickstart casos 1–4 e 11 num orçamento de teste, e depois contra o orçamento real (caso 1 bate ao centavo com o relatório do Actual).

### Verificação da História 1 (definir antes de implementar)

- [ ] T020 [US1] Acrescentar ao `specs/005-servidor-mcp-financeiro/quickstart.md` a seção "Orçamento de teste": subir o servidor local (`corepack yarn start:server-dev`), criar o orçamento demo ("View demo") e semear, com valores conhecidos, despesas em 3 categorias em dois meses, um pagamento de fatura ligado como transferência, um estorno, e uma transação cuja descrição contém `CPF 123.456.789-09`; listar o resultado **esperado** de cada pergunta dos casos 1–4 e 11

### Implementação da História 1

- [ ] T021 [US1] Preencher `## Protocolo de resposta` e `## Papel` em `.claude/agents/assistente-financeiro.md`: gasto por categoria e grupo (`actual_transactions_aggregate`, `excludeTransfers=true`), comparação entre períodos, formatação pt-BR/BRL, período sempre explícito, resposta "não há dados no período" (nunca zeros)
- [ ] T022 [US1] Em `.claude/agents/assistente-financeiro.md`, instruir o detalhe por categoria/estabelecimento/conta (`actual_transactions_filter`, ordenado por valor) e o tratamento de estorno e de transação dividida
- [ ] T023 [US1] [Pedro] Executar os casos 1–4 e 11 contra o orçamento de teste e, depois, contra o real; registrar resultados e divergências em `specs/005-servidor-mcp-financeiro/verification.md` (critério CS-002: ao centavo)
- [ ] T024 [US1] Verificar a máscara de ponta a ponta: perguntar pela transação com `CPF 123.456.789-09` e confirmar `[CPF]` na resposta; registrar em `verification.md`

**Checkpoint**: História 1 funcional. É o MVP — já dá para usar no dia a dia.

---

## Fase 4 — História 2: Saber quanto confiar na resposta (P2)

**Objetivo**: toda análise traz o bloco "Confiança nos dados"; listas de não categorizadas e de duplicatas suspeitas sob demanda.
**Teste independente**: quickstart casos 5–7 no orçamento de teste com lacunas conhecidas.

### Verificação da História 2 (definir antes de implementar)

- [ ] T025 [US2] [Pedro] Spike S-2: com o servidor rodando, chamar `actual_query_run` agrupando por data+valor+descrição com contagem e filtro sobre a contagem; registrar na seção "Resultados dos spikes" de `research.md` se funciona ou se o agrupamento terá de ser feito no cliente
- [ ] T026 [US2] Em `specs/005-servidor-mcp-financeiro/quickstart.md` ("Orçamento de teste"), semear: 4 transações sem categoria de valores conhecidos, uma conta sem movimento há 40 dias, um par de transações duplicadas e um par de Pix de sinais opostos **sem** vínculo de transferência; listar o resultado esperado dos casos 5–7

### Implementação da História 2

- [ ] T027 [US2] Em `.claude/agents/assistente-financeiro.md`, implementar o bloco "Confiança nos dados" (não categorizadas em quantidade e valor, % do gasto, contas sem movimento recente) e o aviso quando passar de 10%
- [ ] T028 [US2] Em `.claude/agents/assistente-financeiro.md`, instruir a lista de não categorizadas, o procedimento de duplicatas conforme T025 (só leitura, nunca `merge`) e o aviso de pares suspeitos de transferência sem vínculo
- [ ] T029 [US2] [Pedro] Repetir os casos 5–7 dez vezes com redações diferentes; registrar falhas em `verification.md`. **Regra de decisão (D-4)**: mais de 1 falha em 10 no bloco de confiança ou nas contagens → abrir spec do MCP complementar, sem fechar esta história como entregue

**Checkpoint**: Histórias 1 e 2 funcionais; a análise avisa quando os dados não merecem confiança.

---

## Fase 5 — História 3: O que está comprometido e quanto sobrou (P3)

**Objetivo**: compromissos futuros por mês e a sobra (receita menos despesa), com a definição à vista.
**Teste independente**: quickstart casos 8 e 9.

### Verificação da História 3 (definir antes de implementar)

- [ ] T030 [US3] Em `specs/005-servidor-mcp-financeiro/quickstart.md` ("Orçamento de teste"), semear transações agendadas para os próximos 3 meses, uma receita e despesas de valores conhecidos no mês fechado; listar o resultado esperado dos casos 8 e 9, inclusive o caso sem nenhum agendamento ("nada registrado")

### Implementação da História 3

- [ ] T031 [US3] Em `.claude/agents/assistente-financeiro.md`, instruir os compromissos por mês (`actual_schedules_get`, `actual_recurring_expenses_summary`), a regra "nada registrado" e o cálculo da sobra a partir de `actual_account_flow_summary`, declarando a definição da seção `## Definições` a cada resposta
- [ ] T032 [US3] [Pedro] Executar os casos 8 e 9 no orçamento de teste e no real; registrar em `verification.md`

**Checkpoint**: as três histórias funcionais.

---

## Fase N — Polimento e Transversais

- [ ] T033 Verificar RF-010/011 e CS-005: caso 10 do quickstart (recusa de escrita) e a comparação de exportações antes/depois da bateria; registrar em `specs/005-servidor-mcp-financeiro/verification.md`
- [ ] T034 [Pedro] Verificar RF-012/013/014/015: busca da senha em repositório, histórico e logs; busca de descrição e valor reais no log do servidor; as três falhas forçadas (senha errada, URL inexistente, sync id errado) e as mensagens (quickstart passos 5 e 7)
- [ ] T035 [Pedro] Medir o efeito na VM (RF-017): `docker stats` antes, durante e depois da abertura de sessão; registrar em `verification.md`; critério: folga sob 384 MB
- [ ] T036 [Pedro] Cronometrar CS-008: configurar do zero seguindo só o `quickstart.md`; critério < 15 min; corrigir o quickstart onde travar
- [ ] T037 **Bloqueada até a sessão que edita `infra/` terminar e mergear**: declarar em `infra/README.md` que o Claude passa a receber descrição, valor, data, categoria e payee do orçamento (princípio VIII) e que a senha fica no Chaveiro. PR separado, para não colidir com as mudanças de log em andamento
- [ ] T038 Reconciliar a numeração: o backlog de `specs/000-produto/spec.md` em `master` não tem esta feature como `005`; ajustar depois que a branch `002-sincronizar-cartao-credito` for mergeada (ela renumera o backlog)
- [ ] T039 `corepack yarn typecheck && corepack yarn lint && corepack yarn test` verdes na raiz; `git diff --stat master...` mostrando **nenhum** arquivo do upstream alterado além do `yarn.lock` aditivo

---

## Dependências e Ordem de Execução

### Entre fases

- Setup (T001–T004) → Fundação (T005–T019) → histórias → Polimento.
- A Fundação bloqueia tudo: sem somente leitura e máscara, nenhuma resposta pode chegar ao Claude.
- T037 depende de coisa externa a esta feature (a sessão de logs/infra) e **não bloqueia** as demais.

### Entre histórias

- US1 não depende de US2/US3. É o MVP e pode ser usada sozinha.
- US2 depende de US1 só porque o bloco de confiança se acopla às respostas de US1; as listas (T028) são independentes.
- US3 depende de US1 (formatação e protocolo), não de US2.
- Os três editam o **mesmo arquivo** (`.claude/agents/assistente-financeiro.md`); por isso as histórias são **sequenciais**, não paralelas, apesar de independentes em valor.

### Dentro de cada fase

- Fundação: spikes (T005, T006) → testes (T007–T011, paralelos) → vermelho (T012) → implementação (T013 → T014/T015 → T016 → T017 → T018) → verde (T019).
- Histórias: verificação esperada → instruções do subagente → execução e registro.

## Oportunidades de paralelismo

- T002 e T004 (Setup).
- T007, T008, T009, T010, T011 (arquivos diferentes).
- T014 e T015 depois de T013 (arquivos diferentes).
- T034, T035 e T036 (testes manuais do Pedro) podem rodar na mesma sessão de trabalho.

## Estratégia de Entrega

1. **MVP = Fundação + História 1 (T001–T024)**. Depois do T024 já dá para perguntar ao Claude sobre os gastos do mês, em leitura apenas, com máscara.
2. Entregar a História 2 antes de confiar em qualquer número para decisão — é ela que avisa quando o orçamento está furado. Se o T029 falhar na regra de decisão, parar e abrir a spec do MCP complementar.
3. História 3 por último; a definição de sobra é provisória e fica em uma seção só.
4. O PR desta feature não inclui `infra/` (T037 vai em PR próprio).

## Resumo

| Fase                | Tarefas | Intervalo   |
| ------------------- | :-----: | ----------- |
| Setup               |    4    | T001–T004   |
| Fundação            |   15    | T005–T019   |
| História 1 (MVP)    |    5    | T020–T024   |
| História 2          |    5    | T025–T029   |
| História 3          |    3    | T030–T032   |
| Polimento           |    7    | T033–T039   |
| **Total**           | **39**  |             |

Tarefas que dependem do Pedro: T023, T025, T029, T032, T034, T035, T036.
