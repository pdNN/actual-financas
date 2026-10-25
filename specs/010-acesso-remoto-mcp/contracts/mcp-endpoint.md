# Contrato: endpoint MCP e paridade com a 005

## Transporte

- `POST /mcp` — MCP por HTTP, **sem sessão** (cada pedido é independente), resposta em JSON simples. Uma instância do servidor MCP é criada por pedido a partir de `createFinancasServer(source)` (o mesmo código da `005`).
- `GET /mcp` e `DELETE /mcp` ⇒ `405 Method Not Allowed` com `Allow: POST`.
- Cabeçalho `Authorization: Bearer <access_token>` obrigatório **em todo pedido**. Token na _query string_ ⇒ ignorado e tratado como ausente.
- `Origin` presente e fora de `REDIRECTS_PERMITIDOS`/lista de origens conhecidas ⇒ `403`. `Origin` ausente (clientes de servidor, CLIs) ⇒ aceito.
- Corpo ≤ 100 kB. Tempo máximo por pedido 60 s.

## Ordem de checagem de cada pedido

1. Limite de falhas por IP (se estourado ⇒ `429`).
2. Filtro de origem opcional (`ORIGENS_PERMITIDAS_CIDR`, desligado por padrão).
3. Bearer presente e JWT válido (assinatura, `exp`, `aud` = `URL_PUBLICA/mcp`).
4. Acesso `gid` **ativo** no estado (cache ≤ 30 s), dentro dos prazos, não afetado por `revogadoAntesDe`, e `pessoa` ainda autorizada.
5. Limite de consultas por acesso.
6. Só então o pedido chega ao servidor MCP. Se o orçamento do Actual ainda estiver abrindo, a **ferramenta** espera (até 40 s) — o `initialize` e `tools/list` respondem na hora.
7. Registra um evento de auditoria (`consulta` ou `recusado`), sem conteúdo.

## Ferramentas

Exatamente as publicadas pela `005` (`createFinancasServer`), todas com `readOnlyHint: true`:

`contas`, `categorias`, `gasto_por_categoria`, `comparar_periodos`, `transacoes`, `sem_categoria`, `fluxo_e_sobra`.

- **Paridade automática**: ferramenta nova na `005` aparece aqui sem tocar `remoto/`. Um teste congela a lista publicada e exige `readOnlyHint` em todas; mudar a lista exige mudar o teste de propósito.
- **Resposta**: igual à da `005` (JSON em centavos + campos `_brl`, tudo por `maskDeep`), com **um campo novo** `atualizado_em` (ISO-8601 da última sincronização do orçamento).
- **Erro de ferramenta** (`isError: true`), mensagens em pt-BR e distinguíveis (RF-022), sem detalhes internos:

| Situação                            | Mensagem ao usuário                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Actual fora do ar                   | "O servidor do Actual está inacessível agora. Tente de novo em alguns minutos."    |
| Token do Actual inválido            | "O assistente perdeu o acesso ao Actual. Avise o Pedro para renovar a credencial." |
| Orçamento não encontrado            | "Orçamento não encontrado (confira o Sync ID)."                                    |
| Orçamento ainda carregando (> 40 s) | "O orçamento está carregando; tente de novo em instantes."                         |
| Limite de consultas                 | "Muitas consultas seguidas. Aguarde um minuto."                                    |
| Parâmetro inválido                  | Mensagem de validação da ferramenta (já existe na `005`)                           |

Acesso expirado/encerrado **não** chega como erro de ferramenta: é `401`, e o cliente de IA inicia a reautorização (ou mostra "reconecte o conector").

## `instructions` — o protocolo viaja com o servidor

**Por quê**: no Claude Code a `005` entrega definições e protocolo por um _subagente_; nos outros clientes esse subagente não existe. O campo `instructions` do `initialize` é a forma padrão, aceita por qualquer cliente MCP, de levar essa orientação.

Conteúdo (de `protocol.ts`, pt-BR, ≈ 1 página), **fonte única** das regras de negócio para o caminho remoto:

1. **Papel**: assistente financeiro do casal, só lê, responde em pt-BR, valores `R$ 1.234,56`, datas `dd/mm/aaaa`; primeiro a resposta, depois o detalhe.
2. **Definições**: despesa e receita são _externas_ (transferência entre contas do casal e pagamento de fatura **não contam**); **sobra = receita − despesa (definição provisória)**; período sempre em datas explícitas e dito na resposta; usar os campos `_brl`; não somar listas de cabeça.
3. **Protocolo**: resolver o período; usar as ferramentas; comparação mostra valor de cada período e variação (R$ e %); detalhe lista data, descrição, valor do maior para o menor; **sem transações no período ⇒ "não há dados no período"**, nunca zeros; informar o instante `atualizado_em`; terminar com o bloco "Período / Definições".
4. **Confiança nos dados**: avisar quando houver transações sem categoria (chamar `sem_categoria` junto de qualquer análise de período) e indicar a atualidade; _quando a `005` entregar o bloco completo (história 2), ele passa a valer aqui automaticamente_.
5. **Recusas**: escrever/categorizar/criar regra/apagar/importar ⇒ "Nesta versão eu só consigo ler o orçamento. Para alterar, faça no Actual."; dado fora do Actual ⇒ dizer que não tem; nunca citar número de conta/cartão/CPF/CNPJ; `[CPF]`, `[CNPJ]`, `[CARTAO]`, `[NUM]` são a máscara.

**Teste de sincronia**: `protocol.test.ts` verifica que as frases-chave (a definição de sobra, as palavras da recusa, "não há dados no período") existem **tanto** em `protocol.ts` **quanto** em `.claude/agents/assistente-financeiro.md`. Divergência quebra o teste.

**Limite honesto**: `instructions` orienta o modelo do cliente; não é garantia. O que não pode falhar está **em código**: ausência de ferramentas de escrita, máscara de PII e exclusão de transferências (dentro das ferramentas).

## Compatibilidade entre clientes

O servidor não detecta nem trata o cliente por nome. Diferenças entre provedores ficam em duas listas de **configuração**: `REDIRECTS_PERMITIDOS` e (opcional) `ORIGENS_PERMITIDAS_CIDR`. O teste de contrato usa um cliente genérico (o do SDK), de modo que o que passa ali vale para qualquer cliente que siga o padrão.
