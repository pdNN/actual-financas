# Quickstart: do zero à primeira pergunta

Meta (CS-008): menos de 15 minutos. Nenhum passo altera o servidor de produção.

## Pré-requisitos

- Node >= 22 na máquina do Pedro.
- URL do Actual (https), **token de sessão** (passo 0) e **Sync ID** do orçamento (Configurações → Avançado).
- Se o orçamento tiver criptografia ponta a ponta, a senha dele também.

## 0. Obter o token de sessão (uma vez)

A produção entra por login Google, sem senha de servidor; o servidor MCP usa o
token de sessão do Actual (ver "Emenda D-1" em `research.md`). Com o Actual aberto
e logado no navegador, no console:

```js
indexedDB.open('actual').onsuccess = e =>
  (e.target.result
    .transaction('asyncStorage')
    .objectStore('asyncStorage')
    .get('user-token').onsuccess = r => console.log(r.target.result));
```

Copie o valor direto para o passo seguinte. Nunca em arquivo, mensagem ou chat.

## 1. Guardar as credenciais no Chaveiro (uma vez)

```bash
security add-generic-password -s actual-financas-mcp -a url           -w 'https://SEU-DOMINIO'
security add-generic-password -s actual-financas-mcp -a sync-id       -w 'SEU-SYNC-ID'
security add-generic-password -s actual-financas-mcp -a session-token -w
```

O `-w` sem valor pede o token no terminal, sem deixá-lo no histórico. Se o
orçamento tiver criptografia, acrescente `-a budget-password`.

## 2. Abrir o Claude Code neste repositório e chamar o subagente

```
@assistente-financeiro quanto gastamos por categoria em setembro?
```

O servidor sobe sozinho, em modo somente leitura, ao primeiro uso do subagente.

## 3. Bateria de verificação (aceite da feature)

| #   | Pergunta / ação                                     | Esperado                                                              | Requisito          |
| --- | --------------------------------------------------- | --------------------------------------------------------------------- | ------------------ |
| 1   | Gasto por categoria de um mês fechado               | Total por categoria bate ao centavo com o relatório do Actual         | RF-001, CS-002     |
| 2   | Comparar com o mês anterior                         | Por categoria: os dois valores e a variação                           | RF-002             |
| 3   | Maiores gastos de uma categoria                     | Lista com data, descrição e valor, ordenada                           | RF-003             |
| 4   | Pagamento de fatura e transferência do mês          | Não entram como despesa nem receita                                   | RF-004, CS-003     |
| 5   | "O que está sem categoria?"                         | Lista por valor decrescente                                           | RF-005             |
| 6   | Qualquer análise                                    | Traz período, definições e bloco "Confiança nos dados"                | RF-006, CS-004     |
| 7   | "Há duplicadas?"                                    | Lista suspeitas, sem alterar nada                                     | RF-007             |
| 8   | "Quanto já está comprometido nos próximos 3 meses?" | Totais por mês; se não há agendamento, diz que não há nada registrado | RF-008             |
| 9   | "Quanto sobrou em setembro?"                        | Receita, despesa, diferença e a definição                             | RF-009             |
| 10  | "Categorize as não categorizadas para mim"          | Recusa explicando que só lê                                           | RF-010, 011        |
| 11  | Período sem transações                              | "Não há dados no período"                                             | História 1, cen. 5 |

Repetir 1–9 dez vezes com variações de redação. O critério do plano (D-4) é no
máximo **1 falha em 10** no bloco de confiança e nas contagens. Acima disso, abrir
a spec do MCP complementar.

## 4. Provar que nada foi escrito (CS-005)

Antes da bateria: exportar o orçamento pelo Actual (Configurações → Exportar).
Depois: exportar de novo e comparar o conteúdo das tabelas `transactions`,
`categories`, `rules` e `schedules`. Devem ser idênticas.

## 5. Provar a privacidade (RF-012, RF-013, RF-014)

- Colocar uma transação de teste cuja descrição contenha `CPF 123.456.789-09` e
  perguntar por ela: a resposta mostra o CPF fictício (liberado desde a
  constituição 1.2.0). Para provar a máscara que continua valendo, usar uma
  descrição com `conta 12345-6` ou um cartão de teste: a resposta mostra
  `conta [NUM]` / `[CARTAO]`.
- Procurar o token de sessão no repositório, no histórico do shell e nos logs do servidor:
  `git grep` e `grep -r` não devem achá-la.
- Abrir o arquivo de log do servidor após a bateria e procurar descrições e
  valores reais: não devem existir.

## 6. Medir o efeito na VM (RF-017)

Em outro terminal, enquanto a bateria roda:

```bash
gcloud compute ssh <vm> --command "docker stats --no-stream"
```

Registrar memória do container antes, durante e depois da abertura da sessão.
Critério: continuar abaixo do limite de 384 MB com folga.

## 7. Falhas forçadas (RF-015)

| Provocar                   | Mensagem esperada                           |
| -------------------------- | ------------------------------------------- |
| Token inválido ou expirado | "token de sessão ... expirou ou é inválido" |
| URL inexistente            | "servidor do Actual inacessível"            |
| Sync ID errado             | "orçamento não encontrado"                  |

---

## Orçamento de teste (para verificar sem dados reais)

Serve para as verificações das três histórias sem usar dados do casal, e para
provar a máscara de privacidade de conta e cartão e a passagem do CPF fictício.

### Montagem

1. Subir o Actual local, sem tocar na produção: `corepack yarn start:server-dev`
   e abrir `http://localhost:3001`.
2. Criar um orçamento novo ("Começar do zero") com as contas **Conta Teste**
   (corrente) e **Cartão Teste** (cartão de crédito).
3. Criar as categorias de despesa **Mercado**, **Transporte** e **Lazer**, e a de
   receita **Salário**.
4. Na **Conta Teste**, importar `specs/005-servidor-mcp-financeiro/fixtures/orcamento-teste.csv`
   (mapear Data, Beneficiário, Notas, Categoria e Valor).
5. Criar à mão uma **transferência** de R$ 1.000,00 em 2026-09-28 da Conta Teste
   para o Cartão Teste, como pagamento de fatura (o Actual liga as duas pontas).
6. Apontar o Chaveiro (passo 1 acima) para `http://localhost:5006`, o token de
   sessão do servidor local e o Sync ID do orçamento de teste.

### Resultados esperados (setembro de 2026, mês fechado)

| Pergunta                                                 | Esperado                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Gasto por categoria em setembro                          | Mercado R$ 550,00 · Lazer R$ 260,00 · Transporte R$ 60,00 · **total R$ 870,00**                                      |
| Gasto por categoria em agosto                            | Mercado R$ 450,00 · Lazer R$ 120,00 · Transporte R$ 80,00 · **total R$ 650,00**                                      |
| Comparar setembro com agosto                             | Mercado +R$ 100,00 (+22,2%) · Lazer +R$ 140,00 (+116,7%) · Transporte −R$ 20,00 (−25,0%) · total +R$ 220,00 (+33,8%) |
| Maiores gastos de Lazer em setembro                      | Cinema Real R$ 250,00, depois PIX JOAO R$ 10,00 (com o CPF fictício visível)                                         |
| O pagamento de fatura de R$ 1.000,00 entra como despesa? | Não: nem no total, nem em qualquer categoria                                                                         |
| Gasto em outubro de 2026                                 | "Não há dados no período"                                                                                            |
| Quanto sobrou em setembro                                | Receita R$ 5.000,00 − despesa R$ 870,00 = **R$ 4.130,00**, com a definição à vista                                   |

Se algum número divergir, o orçamento de teste está montado errado **ou** o
assistente errou: confira primeiro no relatório do próprio Actual e anote em
`verification.md`.
