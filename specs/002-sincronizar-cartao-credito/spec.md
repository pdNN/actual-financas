# Especificação: Sincronizar o cartão de crédito via Open Finance

**Branch**: `002-sync-cartao-open-finance`
**Criada em**: 2026-08-10
**Status**: Validada em produção (2026-10-19) — falta registrar a conferência de CS-003 e CS-004
**Entrada**: Descrição do usuário: "Sincronizar cartão de crédito do Itaú via Pluggy Open Finance"

---

## Contexto

O problema central do produto é que **as despesas nunca foram cadastradas**, e o
cartão de crédito é onde está o volume delas.

Esta feature nasceu de um pedido diferente: construir um importador para as
planilhas `.xlsx` da fatura do Itaú. A análise das faturas reais de janeiro e
fevereiro de 2026 inverteu a conclusão, e o registro dessa inversão está em
`specs/000-produto/spec.md`. Em resumo, o arquivo tem três armadilhas que a
sincronização automática não tem:

- a data na planilha é a da **compra**, não a da cobrança — uma parcela antiga
  cairia num mês de orçamento já fechado;
- parcelas consecutivas da mesma compra diferem por **um centavo**, o que torna a
  deduplicação frágil;
- a descrição vem suja (`Angeloni Super Loja 20curitibabra`), o que sabota a
  classificação automática mais adiante.

A sincronização por Open Finance resolve os três na origem, é **gratuita para uso
pessoal**, e não exige ritual mensal nenhum.

---

## Cenários de Usuário e Testes

### História 1 — As compras do cartão aparecem sozinhas (Prioridade: P1) 🎯 MVP

Como casal, queremos que as compras do cartão apareçam no sistema sem ninguém
precisar baixar arquivo nem digitar nada, com cada parcela no mês em que ela é
efetivamente cobrada.

**Por que essa prioridade**: é o objetivo inteiro da feature e o caminho mais
curto para o problema central do produto. As outras histórias só protegem esta.

**Teste independente**: conectar o cartão, sincronizar, e comparar o resultado
com uma fatura em mãos — os valores e o total precisam bater.

**Cenários de aceitação**:

1. **Dado** que o cartão está conectado, **Quando** eu peço para sincronizar,
   **Então** as compras do período aparecem na conta do cartão sem eu digitar nada.
2. **Dado** uma compra parcelada feita há meses, **Quando** a parcela é cobrada
   na fatura deste mês, **Então** ela aparece **neste mês**, e não no mês da
   compra original.
3. **Dado** que eu sincronizo duas vezes seguidas, **Quando** a segunda
   sincronização termina, **Então** nenhuma transação foi duplicada.
4. **Dado** um mês fechado, **Quando** eu comparo o total da conta do cartão com
   o valor da fatura, **Então** os dois batem.
5. **Dado** que a compra foi feita num estabelecimento conhecido, **Quando** ela
   aparece no sistema, **Então** o nome exibido é legível, e não o código sujo da
   maquininha.

---

### História 2 — O pagamento da fatura não vira despesa (Prioridade: P2)

Como quem confere as contas, quero que o pagamento da fatura apareça como
movimentação entre as nossas próprias contas, para que ele não seja contado como
despesa nem como receita e não distorça o orçamento.

**Por que essa prioridade**: sem isso o orçamento mente duas vezes — conta o
gasto na compra e conta de novo no pagamento. Fica em P2 porque só faz sentido
depois que as compras já estão entrando.

**Teste independente**: pagar uma fatura, sincronizar, e verificar que o
resultado no total disponível do orçamento é o esperado — o dinheiro saiu da
conta corrente e o saldo devedor do cartão diminuiu na mesma medida.

**Cenários de aceitação**:

1. **Dado** que a fatura foi paga, **Quando** o pagamento aparece no sistema,
   **Então** ele é registrado como movimentação entre contas próprias, sem
   categoria de despesa.
2. **Dado** que tanto a conta corrente quanto o cartão estão sincronizados,
   **Quando** o mesmo pagamento chega pelos dois lados, **Então** ele aparece uma
   única vez.
3. **Dado** um estorno ou crédito na fatura, **Quando** ele é sincronizado,
   **Então** reduz o valor devido, em vez de virar receita.

---

### História 3 — O acesso é meu e eu sei quando ele vence (Prioridade: P3)

Como responsável pelos dados do casal, quero saber por onde os dados passam,
conseguir cortar esse acesso quando quiser, e ser avisado antes de o
consentimento vencer.

**Por que essa prioridade**: é a história de menor valor imediato, mas é a única
que trata do risco que a feature introduz. Sem ela, o sync um dia para em
silêncio e ninguém entende por quê.

**Teste independente**: revogar o consentimento pelo aplicativo do banco e
verificar que o sistema para de sincronizar e informa o motivo claramente, em vez
de falhar de forma obscura.

**Cenários de aceitação**:

1. **Dado** que quero interromper o compartilhamento, **Quando** eu revogo o
   acesso pelo banco, **Então** o sistema para de sincronizar e informa que o
   consentimento foi revogado.
2. **Dado** que o consentimento está perto de vencer, **Quando** eu abro o
   sistema, **Então** sou avisado antes de a sincronização quebrar.
3. **Dado** que a sincronização falhou, **Quando** eu olho o resultado, **Então**
   entendo se o problema foi consentimento, indisponibilidade do serviço ou outra
   coisa.
4. **Dado** que eu prefiro não usar sincronização, **Quando** decido lançar à mão,
   **Então** o sistema continua plenamente utilizável.

---

### Casos de Borda

- **Consentimento expirado** no meio de um mês — o Open Finance costuma exigir
  renovação periódica.
- **Primeiro sync com histórico limitado**: é provável que o provedor não devolva
  todas as faturas antigas. O que não vier fica para a carga histórica (`007`).
- **Serviço fora do ar** ou lento — não pode corromper nem duplicar o que já entrou.
- **Transação ainda não consolidada** que depois muda de valor ou desaparece.
- **IOF e compra em moeda estrangeira**, que aparecem como lançamentos separados.
- **Vários números de cartão** (físico, virtual recorrente, virtual temporário) na
  mesma fatura.
- **Cartão adicional** em nome da Julia, se existir, misturado à mesma fatura.
- **Compra estornada** no mês seguinte ao da cobrança.
- Transação que já havia sido **lançada à mão** antes de o sync existir.

---

## Requisitos

### Requisitos Funcionais

- **RF-001**: Sistema DEVE permitir conectar o cartão de crédito e trazer as
  transações sem que o usuário digite ou baixe arquivo.
- **RF-002**: Sistema DEVE registrar cada parcela no mês em que ela é cobrada, e
  não no mês da compra original.
- **RF-003**: Sistema DEVE preservar a data original da compra como informação
  consultável, mesmo quando a data usada para o orçamento for outra.
- **RF-004**: Sistema NÃO DEVE duplicar transações quando a sincronização é
  executada mais de uma vez.
- **RF-005**: Sistema DEVE registrar o pagamento da fatura como movimentação
  entre contas próprias, sem afetar o total orçado.
- **RF-006**: Sistema DEVE representar valores de forma que o saldo da conta do
  cartão corresponda ao valor devido na fatura.
- **RF-007**: Sistema DEVE exibir nome de estabelecimento legível quando essa
  informação estiver disponível.
- **RF-008**: Sistema NÃO DEVE armazenar senha, token de acesso ao banco ou
  qualquer credencial bancária — nem em banco de dados, nem em log, nem em
  repositório.
- **RF-009**: Sistema DEVE informar, de forma distinguível, quando a
  sincronização falha por consentimento revogado ou expirado.
- **RF-010**: Sistema DEVE permitir uso pleno sem sincronização, para quem
  preferir lançar à mão.
- **RF-011**: A documentação DEVE declarar por onde os dados passam, o escopo do
  consentimento e como revogá-lo.

### Entidades-Chave

- **Conta de cartão de crédito**: representa a fatura como um todo. Saldo
  negativo enquanto há valor devido; volta a zero quando a fatura é paga.
  Participa do orçamento — decisão deliberada, e **irreversível** na ferramenta
  se criada de outro modo.
- **Transação de cartão**: data de cobrança, data original da compra,
  estabelecimento, valor, identificação de parcela quando houver, e qual das
  numerações de cartão originou a compra.
- **Pagamento de fatura**: movimentação entre a conta corrente e a conta do
  cartão. Não é despesa nem receita.
- **Consentimento**: autorização dada no banco, com validade e possibilidade de
  revogação, fora do controle deste sistema.

---

## Critérios de Sucesso

- **CS-001**: Ao fim de um mês, as compras do cartão daquele mês estão no sistema
  sem ninguém ter baixado arquivo ou digitado transação.
- **CS-002**: O total da conta do cartão num mês fechado bate com o valor da
  fatura correspondente.
- **CS-003**: Nenhuma parcela aparece num mês de orçamento anterior ao da sua
  cobrança.
- **CS-004**: Sincronizar duas vezes seguidas não cria nenhuma transação
  duplicada.
- **CS-005**: O pagamento da fatura não altera o total disponível do orçamento.
- **CS-006**: Revogar o acesso pelo banco interrompe a sincronização em no máximo
  uma tentativa, com motivo compreensível.
- **CS-007**: Nenhuma credencial bancária existe em qualquer lugar do sistema —
  verificável por inspeção.

---

## Fora de Escopo

- Classificar as transações por categoria — é a `003` e a `004`.
- Carga histórica das faturas antigas em XLSX — é a `007`, e só se o primeiro
  sync não trouxer o período.
- Sincronizar conta corrente, poupança ou investimentos. Esta feature é sobre o
  cartão; a conta corrente entra apenas como contraparte do pagamento da fatura.
- Detectar transferências entre contas do casal em geral — é a `008`.
- Lançamento rápido no celular — é a `006`.
- Qualquer alteração no código de integração que vem do upstream. O valor desta
  decisão está justamente em **não** reescrevê-lo.

---

## Premissas

- A conta corrente de onde sai o pagamento da fatura será representada no
  sistema. Sem ela, o pagamento não tem contraparte e vira exceção manual.
- Todas as numerações de cartão da mesma fatura (físico e virtuais) pertencem a
  uma única conta, porque a fatura é uma só e o pagamento é único. A numeração
  fica como informação da transação.
- O volume é de finanças pessoais: centenas de transações por mês.
- O usuário aceita que dados de conta e cartão transitem por um agregador
  regulado, conforme o princípio VIII da constituição, emendado para este fim.
- Sincronização é acionada pelo usuário, não continuamente — o que é suficiente
  para o caso de uso e mais barato em recursos.

---

## Impacto na Constituição

- **Princípio VIII — privacidade explícita**: esta feature é a razão da emenda
  `1.1.0`, que separou "provider de IA" de "agregador de Open Finance regulado".
  Com a emenda, a feature está **em conformidade**: RF-008 e CS-007 garantem que
  nenhuma credencial bancária passe por aqui, e RF-011 cumpre a exigência de
  declarar por onde os dados passam.
- **Princípio II — compatibilidade com upstream**: a feature usa a integração do
  upstream sem modificá-la. É o desfecho mais alinhado ao princípio que havia
  disponível — a alternativa era escrever um importador próprio.
- **Princípio V — orçamento da VM**: sincronizar sob demanda não adiciona
  processo em background nem dependência pesada. O plano DEVE confirmar o
  impacto de memória.
- **Princípio VII — teste para lógica custom**: se a feature se resolver só com
  configuração, não há lógica custom nova a testar. Qualquer código próprio que
  o plano introduzir DEVE vir com teste.

---

## Registro de validação

- **2026-10-18 — Falha encontrada e corrigida.** O primeiro sync em produção
  falhou com `410 Gone / ENDPOINT_DEPRECATED`: o `pluggy-sdk@0.89.0`, declarado
  pelo upstream (inclusive na 26.10.0), chama o endpoint v1 de transações,
  aposentado pelo Pluggy. Correção: override aditivo `pluggy-sdk ^0.92.0` na
  raiz (PR #9), versão que o upstream já adotou depois da 26.10.0. O override
  fica redundante quando a próxima release do upstream chegar.
- **2026-10-19 — Sync validado em produção** pelo Pedro, com o Meu Pluggy, após
  o deploy do merge com o upstream 26.10.0 e do fix acima, incluindo a
  conferência contra a fatura. CS-003 (parcela no mês da cobrança) e CS-004
  (sem duplicar) devem ser registrados aqui quando conferidos.
