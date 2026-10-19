# Pesquisa: Servidor MCP financeiro (somente leitura)

**Data**: 2026-10-18
**Método**: leitura do código-fonte do servidor candidato (clone raso, **nada executado**), do `docs/SECURITY_AND_PRIVACY.md` dele, da documentação de _hooks_ do Claude Code, e do npm.

---

## Análise do servidor candidato

`agigante80/actual-mcp-server`, v0.22.46, último commit em 2026-10-16.

| Aspecto                    | Achado                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Licença / publicação       | MIT; publicado no npm (`npx -y actual-mcp-server --stdio`), binário `actual-mcp-server`                                                                                                       |
| Alinhamento com o Actual   | Depende de `@actual-app/api ^26.10.0` — a mesma linha do upstream atual                                                                                                                       |
| Superfície                 | 85 módulos de ferramenta; 47 capazes de escrever                                                                                                                                              |
| **Somente leitura**        | `MCP_READ_ONLY=true` **esconde e recusa** as ferramentas de escrita (`callTool` recusa mesmo ferramenta não publicada). A lista `WRITE_CAPABLE` é fixa no código, com teste contra o grafo de chamadas, e **falha fechada** (nome desconhecido ou conjunto vazio derruba a inicialização). Nunca lê "anotações" de ferramenta |
| Transferências             | `actual_transactions_aggregate` tem `excludeTransfers=true` por padrão e identifica transferência só por `transfer_id`; `actual_account_flow_summary` separa receita, despesa, crédito, transferência e reconcilia saldo inicial/final |
| Já existe                  | resumo por categoria e por payee, não categorizadas, agendadas, despesas recorrentes, pesquisa por mês/valor/payee, `actual_query_run` (consulta livre de leitura)                              |
| Conexão                    | Em `--stdio`, **um login por processo**, reaproveitado entre chamadas                                                                                                                         |
| Transporte stdio           | Sem porta, sem token, sem Docker                                                                                                                                                              |
| Log                        | Redação de segredos/PII **no log** (#220). **Não** redige o conteúdo devolvido ao cliente                                                                                                     |
| Tamanho / risco            | Grande (1.247 commits; pool de conexões, HTTP, OIDC, Prometheus). Para uso de uma pessoa, a maior parte é superfície que não será usada                                                       |

### Lacunas frente à spec

| Requisito                           | Coberto pelo servidor? | Como fechar                                                                                       |
| ----------------------------------- | :--------------------: | ------------------------------------------------------------------------------------------------- |
| RF-001, 002, 003 (gasto, comparação, detalhe) | Sim          | `transactions_aggregate`, `transactions_summary_by_category`, `transactions_filter`              |
| RF-004 (transferência não é despesa) | Sim                   | `excludeTransfers`, `account_flow_summary`. **Limite**: só vale para transferências ligadas por `transfer_id` |
| RF-005 (sem categoria)              | Sim                    | `transactions_uncategorized`                                                                      |
| RF-006 (completude junto da análise) | **Não**               | Protocolo do subagente (D-4): sempre chamar `uncategorized` e consultar a última data por conta   |
| RF-007 (duplicatas, sem apagar)     | **Não** (só `merge`)   | `actual_query_run` com agrupamento por data+valor+descrição (D-5; confirmar no spike S-2)         |
| RF-008 (compromissos futuros)       | Parcial                | `schedules_get`, `recurring_expenses_summary`. Parcela só aparece se estiver agendada             |
| RF-009 (sobra = receita − despesa)  | Quase                  | `account_flow_summary` já separa receita e despesa externas; o subagente declara a definição (D-6) |
| RF-010, 011 (somente leitura)       | Sim                    | `MCP_READ_ONLY=true` + camada extra no `PreToolUse` (D-2)                                          |
| **RF-012 (sem CPF/conta/cartão)**   | **Não**                | Máscara na resposta (D-3). O servidor só protege o log                                            |
| RF-013 (senha só local)             | Sim, com cuidado       | Lançador lê do chaveiro (D-1); a senha é variável de ambiente do processo filho                   |
| RF-014 (log sem PII)                | A verificar            | Teste no quickstart: rodar uma sessão e procurar descrição/valor no log                           |
| RF-015 (erros distinguíveis)        | A verificar            | Quickstart, passos de falha forçada (senha errada, servidor fora do ar)                           |
| RF-017 (não alterar a produção)     | Sim                    | Cliente comum do Actual; medir impacto (quickstart, passo 6)                                      |

---

## Decisões

### D-1 — Adotar o servidor existente, fixado, via `npx`, em `--stdio`

- **Decisão**: usar `actual-mcp-server@0.22.46`, executado por um lançador nosso,
  com `MCP_READ_ONLY=true` e `--stdio`. Atualizar a versão é um ato deliberado
  (mudar a constante do lançador e passar nos testes).
- **Justificativa**: cobre a maior parte das perguntas sem escrever código;
  mantido ativamente; segue o `@actual-app/api` do upstream; o modo
  somente leitura é bem projetado (esconde, recusa e falha fechado).
- **Alternativas**:
  - _Escrever um servidor próprio_: custo alto de manter, e refaria conexão,
    tempo-limite, travas de sessão e serialização que o projeto externo já
    resolveu. Rejeitada por ora.
  - _Fork ou cópia do código_ (`vendor`): carrega ~1,2 MB de código alheio no
    repositório e cria um segundo fork para manter. Rejeitada.
  - _Versão flutuante_ (`npx` sem versão): uma atualização do pacote poderia
    mudar a superfície de escrita sem aviso. Rejeitada.
- **Senha**: o lançador lê do Chaveiro do macOS (`security find-generic-password`)
  e a entrega só no ambiente do processo filho. Rejeitado: arquivo `.env`
  (vira credencial em disco, RF-013) e argumento de linha de comando (aparece
  na lista de processos).

### D-2 — Somente leitura em três camadas

1. **Servidor**: `MCP_READ_ONLY=true` (esconde e recusa).
2. **Lista fechada**: o lançador fixa `MCP_TOOLSETS` para os conjuntos de leitura
   (`context`, `query` e os de leitura de transações/orçamento/agendamentos —
   lista exata em `contracts/tool-surface.md`), de modo que um conjunto novo
   numa versão futura não apareça por padrão.
3. **Cliente**: `PreToolUse` do subagente nega qualquer ferramenta do servidor
   que não esteja na lista permitida (cinto e suspensório; cobre falha do
   servidor).
- **Justificativa**: CS-005 é o requisito mais caro de errar (dado do casal). Três
  camadas independentes tornam improvável que uma falha sozinha escreva.
- **Alternativa rejeitada**: confiar só em `MCP_READ_ONLY`. É bem feito, mas é
  uma única camada num projeto de terceiros que muda rápido.

### D-3 — Máscara de dados sensíveis na resposta

- **Decisão**: `mask-pii.ts` substitui, no texto devolvido por qualquer
  ferramenta do servidor, CPF (11 dígitos, com ou sem pontuação), CNPJ (14),
  números com cara de cartão (13–19 dígitos, validados por Luhn) e números de
  conta/agência quando aparecem com rótulo (`ag`, `agência`, `conta`, `cc`).
  Entra como `PostToolUse` com `updatedToolOutput` no cabeçalho do subagente.
- **Justificativa**: a constituição (VIII) proíbe esses dados no provider de IA,
  e descrições de Pix e de transferência brasileiras às vezes os carregam. O
  servidor só redige o log. Determinístico, sem modelo, testável.
- **Alternativas**: _não fazer nada_ — viola o princípio VIII. _Pedir ao Claude
  que ignore_ — o dado já terá saído da máquina; não é controle.
  _Alterar o servidor externo_ — vira fork.
- **Risco residual aceito**: nome de pessoa em descrição de Pix é payee e é
  permitido pela constituição; não é mascarado. Falso positivo (mascarar um
  valor legítimo) é preferível a falso negativo; o Luhn limita o ruído nos cartões.
- **Dependência**: confirmar no spike S-1 o formato exato de `updatedToolOutput`.

### D-4 — Completude acoplada a toda análise (RF-006)

- **Decisão**: o protocolo do subagente (contrato em `answer-protocol.md`) obriga,
  antes de responder uma análise de período, a: chamar `transactions_uncategorized`
  no mesmo período e a obter a última data de movimento por conta. A resposta
  carrega o bloco "Confiança nos dados".
- **Justificativa**: o histórico do projeto é de despesas ausentes; uma resposta
  precisa avisar. Sem código novo.
- **Alternativa** (escalonamento): ferramenta própria `completude` num MCP
  complementar. Só se, na verificação do quickstart, o subagente errar contagens
  ou esquecer o bloco em mais de 1 de 10 perguntas.

### D-5 — Duplicatas por consulta, sem escrita (RF-007)

- **Decisão**: o subagente usa `actual_query_run` (ActualQL) agrupando por
  data+valor+descrição e contando, e lista os grupos com mais de um.
  Nunca chama `merge`/`delete`, que de qualquer forma estão bloqueados.
- **Justificativa**: leitura pura, sem código.
- **Spike S-2**: confirmar que a ActualQL suporta o agrupamento com contagem
  e filtro sobre a contagem; senão, o subagente agrupa no cliente a partir de
  `transactions_filter` (aceitável no volume de centenas por mês).

### D-6 — "Sobra" = receita − despesa, declarada em toda resposta (RF-009)

- **Decisão**: o subagente calcula `sobra = receita externa − despesa externa` a
  partir de `account_flow_summary`, que já separa transferências, e diz sempre
  "sobra = receita − despesa (definição provisória)". A definição vive em **uma**
  seção do arquivo do subagente, para ser trocada sem tocar no resto.
- **Justificativa**: decisão do Pedro em 2026-10-18; ele pretende refinar o
  racional depois. Isolar a definição é o que torna a troca barata.
- **Alternativa rejeitada**: calcular em código próprio agora. Seria lógica de
  negócio provisória com teste e manutenção, para depois ser descartada.

### D-7 — Limites conhecidos (documentar, não resolver)

- **Transferência sem vínculo**: o servidor só reconhece transferência por
  `transfer_id`. Um Pix entre Pedro e Julia importado de dois extratos, sem
  vínculo, vai contar como despesa e receita. É a feature `008`. O protocolo
  manda avisar quando houver pares suspeitos (mesmo valor, datas próximas, sinais
  opostos) em contas diferentes.
- **Parcelas**: só aparecem como compromisso se estiverem agendadas ou
  recorrentes. Sem isso, a resposta diz que "não há nada registrado" (cenário
  3 da História 3), e não que não há compromissos.
- **Atualidade**: o orçamento é o da última sincronização do processo; dentro de
  uma sessão longa os dados não se renovam sozinhos.

---

## Itens a confirmar na implementação (spikes)

| #   | O que confirmar                                                                                                                                  | Plano B                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| S-1 | Que `hooks` e `mcpServers` no cabeçalho de um subagente funcionam como esperado, e o formato exato de `updatedToolOutput` num `PostToolUse` de MCP | Declarar o servidor em `.mcp.json` próprio e usar `settings.local.json` (não versionado) para o hook |
| S-2 | Agrupamento com contagem na ActualQL via `actual_query_run`                                                                                      | Agrupar no cliente                                                                                    |
