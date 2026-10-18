# Quickstart: do zero à primeira pergunta

Meta (CS-008): menos de 15 minutos. Nenhum passo altera o servidor de produção.

## Pré-requisitos

- Node >= 22 na máquina do Pedro.
- URL do Actual (https), senha do servidor e **Sync ID** do orçamento (Configurações → Avançado).
- Se o orçamento tiver criptografia ponta a ponta, a senha dele também.

## 1. Guardar as credenciais no Chaveiro (uma vez)

```bash
security add-generic-password -s actual-financas-mcp -a url      -w 'https://SEU-DOMINIO'
security add-generic-password -s actual-financas-mcp -a password -w
security add-generic-password -s actual-financas-mcp -a sync-id  -w 'SEU-SYNC-ID'
```

O `-w` sem valor pede a senha no terminal, sem deixá-la no histórico.

## 2. Abrir o Claude Code neste repositório e chamar o subagente

```
@assistente-financeiro quanto gastamos por categoria em setembro?
```

O servidor sobe sozinho, em modo somente leitura, ao primeiro uso do subagente.

## 3. Bateria de verificação (aceite da feature)

| #   | Pergunta / ação                                          | Esperado                                                                                  | Requisito       |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------- |
| 1   | Gasto por categoria de um mês fechado                    | Total por categoria bate ao centavo com o relatório do Actual                             | RF-001, CS-002  |
| 2   | Comparar com o mês anterior                              | Por categoria: os dois valores e a variação                                               | RF-002          |
| 3   | Maiores gastos de uma categoria                          | Lista com data, descrição e valor, ordenada                                               | RF-003          |
| 4   | Pagamento de fatura e transferência do mês               | Não entram como despesa nem receita                                                       | RF-004, CS-003  |
| 5   | "O que está sem categoria?"                              | Lista por valor decrescente                                                               | RF-005          |
| 6   | Qualquer análise                                         | Traz período, definições e bloco "Confiança nos dados"                                    | RF-006, CS-004  |
| 7   | "Há duplicadas?"                                         | Lista suspeitas, sem alterar nada                                                         | RF-007          |
| 8   | "Quanto já está comprometido nos próximos 3 meses?"      | Totais por mês; se não há agendamento, diz que não há nada registrado                     | RF-008          |
| 9   | "Quanto sobrou em setembro?"                             | Receita, despesa, diferença e a definição                                                 | RF-009          |
| 10  | "Categorize as não categorizadas para mim"               | Recusa explicando que só lê                                                               | RF-010, 011     |
| 11  | Período sem transações                                   | "Não há dados no período"                                                                  | História 1, cen. 5 |

Repetir 1–9 dez vezes com variações de redação. O critério do plano (D-4) é no
máximo **1 falha em 10** no bloco de confiança e nas contagens. Acima disso, abrir
a spec do MCP complementar.

## 4. Provar que nada foi escrito (CS-005)

Antes da bateria: exportar o orçamento pelo Actual (Configurações → Exportar).
Depois: exportar de novo e comparar o conteúdo das tabelas `transactions`,
`categories`, `rules` e `schedules`. Devem ser idênticas.

## 5. Provar a privacidade (RF-012, RF-013, RF-014)

- Colocar uma transação de teste cuja descrição contenha `CPF 123.456.789-09` e
  perguntar por ela: a resposta mostra `[CPF]`.
- Procurar a senha no repositório, no histórico do shell e nos logs do servidor:
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

| Provocar                         | Mensagem esperada                         |
| -------------------------------- | ----------------------------------------- |
| Senha errada no Chaveiro         | "senha inválida"                          |
| URL inexistente                  | "servidor do Actual inacessível"          |
| Sync ID errado                   | "orçamento não encontrado"                |
