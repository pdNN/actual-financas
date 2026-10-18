# Modelo de Dados: Servidor MCP financeiro (somente leitura)

**Migrações SQL**: nenhuma. A feature não cria tabela, coluna nem arquivo de
dados. Ela só **lê** o orçamento do Actual.

## Mapa das entidades da spec para o que existe

| Entidade da spec            | De onde vem no Actual                                    | Ferramenta que a expõe                                                                     |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Período                     | Parâmetro de data da consulta                            | Todas as de transação/fluxo                                                                |
| Resumo por categoria        | `transactions` + `categories` + `category_groups`       | `actual_transactions_aggregate`, `actual_transactions_summary_by_category`                 |
| Indicador de completude     | Derivado: não categorizadas + última data por conta     | `actual_transactions_uncategorized`, `actual_accounts_list`, `actual_query_run`            |
| Compromisso futuro          | `schedules` e despesas recorrentes                       | `actual_schedules_get`, `actual_recurring_expenses_summary`                                |
| Definição de sobra          | Regra de negócio (não é dado)                            | Seção "Definições" do subagente `assistente-financeiro`                                    |

## Campos que NUNCA devem chegar ao Claude

Número de conta, número de cartão, CPF/CNPJ, identificador de sessão, senha. O
Actual não tem coluna dedicada a esses valores no que as ferramentas de leitura
devolvem, mas eles podem aparecer **dentro de texto livre** (descrição
importada, notas). Por isso a máscara de `mask-pii` olha o texto, não o campo.

## Estado local (fora do repositório)

| Item                             | Onde                                          | Observação                                  |
| -------------------------------- | --------------------------------------------- | ------------------------------------------- |
| Cópia do orçamento (cache)       | Diretório de dados do servidor, na máquina do Pedro | Fora do repositório. Pode ser apagada a qualquer momento |
| Senha do Actual / do orçamento   | Chaveiro do macOS                             | Nunca em arquivo versionado                 |
