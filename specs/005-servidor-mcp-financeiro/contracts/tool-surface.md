# Contrato: superfície de ferramentas publicada

Lista **fechada**. O lançador a fixa por `MCP_TOOLSETS`/`MCP_TOOLS`, e o `PreToolUse`
do subagente nega tudo o que não estiver aqui. Nomes extraídos da v0.22.46;
a primeira tarefa de implementação os confere contra o pacote fixado (uma
divergência derruba o teste do lançador).

## Permitidas (leitura)

| Grupo            | Ferramentas                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto         | `actual_get_context`, `actual_server_info`, `actual_server_get_version`, `actual_preferences_get`                                                                                                                                                                                                                                                                                |
| Contas           | `actual_accounts_list`, `actual_accounts_get_balance`, `actual_account_groups_list`, `actual_account_flow_summary`                                                                                                                                                                                                                                                               |
| Estrutura        | `actual_categories_get`, `actual_category_groups_get`, `actual_payees_get`, `actual_payees_common_list`, `actual_payee_rules_get`, `actual_rules_get`, `actual_tags_list`                                                                                                                                                                                                        |
| Transações       | `actual_transactions_get`, `actual_transactions_filter`, `actual_transactions_aggregate`, `actual_transactions_summary_by_category`, `actual_transactions_summary_by_payee`, `actual_transactions_uncategorized`, `actual_transactions_search_by_month`, `actual_transactions_search_by_category`, `actual_transactions_search_by_payee`, `actual_transactions_search_by_amount` |
| Orçamento        | `actual_budgets_getMonth`, `actual_budgets_getMonths`, `actual_budgets_get_all`, `actual_budgets_list_available`                                                                                                                                                                                                                                                                 |
| Compromissos     | `actual_schedules_get`, `actual_recurring_expenses_summary`                                                                                                                                                                                                                                                                                                                      |
| Consulta e busca | `actual_query_run`, `actual_entities_search`, `actual_get_id_by_name`, `actual_notes_get`                                                                                                                                                                                                                                                                                        |

## Proibidas (a lista inteira de escrita e administração)

Qualquer ferramenta cujo nome termine em `_create`, `_update`, `_delete`,
`_merge`, `_import`, `_export`, `_close`, `_reopen`, `_switch`, `_setAmount`,
`_setCarryover`, `_holdForNextMonth`, `_resetHold`, `_transfer`, `_batch`,
`_create_batch`, `_create_or_update`, mais `actual_bank_sync`,
`actual_session_list` e `actual_session_close`.

## Comportamento esperado diante de um pedido de escrita (RF-011)

1. A ferramenta nem é oferecida (servidor) → o subagente responde em pt-BR:
   "Nesta versão eu só consigo ler o orçamento. Para alterar, faça no Actual."
2. Se uma chamada proibida mesmo assim sair, o `PreToolUse` a nega e o motivo
   volta ao Claude como erro.

## Contrato da máscara (`mask-pii`)

Entrada: texto (qualquer resposta de ferramenta do servidor, serializada).
Saída: o mesmo texto com:

| Padrão                                           | Substituição     |
| ------------------------------------------------ | ---------------- |
| CPF: `123.456.789-09` ou 11 dígitos              | `[CPF]`          |
| CNPJ: `12.345.678/0001-95` ou 14 dígitos         | `[CNPJ]`         |
| Cartão: 13–19 dígitos que passam em Luhn         | `[CARTAO]`       |
| `ag`/`agência` + dígitos; `conta`/`cc` + dígitos | rótulo + `[NUM]` |

Propriedades exigidas (viram teste): idempotente; não altera valores monetários
(`R$ 1.234,56`, `-12345`) nem datas (`2026-10-18`); não altera identificadores
internos (UUID); nunca lança exceção para entrada inesperada (devolve o texto
como veio e registra só que falhou, sem o conteúdo).
