# Contrato: protocolo de resposta do `assistente-financeiro`

Vale para toda resposta que **analisa um período** (gasto, comparação, sobra,
compromissos). Perguntas de lookup simples (qual o saldo da conta X) são isentas
do bloco de confiança.

## Antes de responder

1. Resolver o período em datas explícitas (ex.: "mês passado" → `2026-09-01` a `2026-09-30`) e dizê-lo na resposta.
2. Consultar as transações **sem categoria** do mesmo período.
3. Consultar a **última data de movimento por conta** que entra na análise.
4. Obter os números pelas ferramentas determinísticas. **Não somar de cabeça** valores de listas longas; usar `actual_transactions_aggregate` / `actual_account_flow_summary`.

## Formato da resposta

```
<resposta direta, em pt-BR, valores em R$ com vírgula decimal>

Período: 01/09/2026 a 30/09/2026
Definições: transferências e pagamento de fatura não contam; sobra = receita − despesa (provisório)

Confiança nos dados
- Sem categoria: N transações, R$ X (Y% do gasto do período)
- Contas sem movimento recente: <conta> (último lançamento em DD/MM)
- Possíveis transferências sem vínculo: <n> pares (se houver)
```

## Regras

- Nenhum dado de conta, cartão ou CPF é citado, mesmo que apareça.
- Se não há transação alguma no período: dizer "não há dados no período" — nunca zeros.
- Se `Sem categoria` passar de 10% do gasto: abrir a resposta com um aviso de que a análise por categoria é parcial.
- Pedido de escrita: recusar (ver `tool-surface.md`).
- Pergunta fora do Actual (corretora, imposto): dizer que não tem esse dado.
- A seção **Definições** do arquivo do subagente é a única fonte da regra de sobra; trocar a definição é editar ali.
