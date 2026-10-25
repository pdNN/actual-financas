# Especificação: Servidor MCP financeiro (somente leitura)

**Branch**: `005-servidor-mcp-financeiro`
**Criada em**: 2026-10-18
**Status**: Rascunho
**Entrada**: Descrição do usuário: "Servidor MCP financeiro do actual-financas: expõe ao Claude Code ferramentas sobre o orçamento do Actual, somente leitura na primeira versão, para responder perguntas sobre gasto por categoria, comparação mensal, transações sem categoria, parcelas futuras e quanto sobrou para investir."

---

## Contexto

O objetivo de longo prazo do Pedro é ter **análises melhores das finanças do
casal**, conversando com o Claude como assistente financeiro. Hoje isso não
existe: os dados ficam dentro do Actual e só podem ser vistos pelas telas e
relatórios dele.

Esta feature entrega a **ponte**: o Claude passa a poder consultar o orçamento
do casal, em linguagem natural, **sem alterar nada**. Pedro pergunta "quanto
gastamos com mercado em setembro comparado a agosto?" e o Claude responde com
os números reais.

Duas coisas precisam estar claras desde o início:

1. **Esta feature não resolve o registro de despesas.** O problema central do
   produto (`specs/000-produto/spec.md`) continua sendo a captura — a
   sincronização do cartão (`002`) e o lançamento rápido (`006`) é que atacam
   isso. Esta feature só é tão útil quanto os dados que já estão no sistema.
   Por isso, ela precisa **dizer o quanto pode confiar nos dados** (História 2),
   em vez de produzir uma análise bonita sobre um orçamento incompleto.
2. **Primeira versão é somente leitura.** Categorizar em lote e criar regras
   são a evolução natural, mas mudam dado do casal e exigem desenho próprio de
   confirmação (princípio III da constituição). Ficam para uma spec seguinte.

Roda na máquina do Pedro, fora da VM, usando a assinatura Claude que ele já
paga (princípios IV e V da constituição).

---

## Cenários de Usuário e Testes _(obrigatório)_

### História 1 — Perguntar para onde o dinheiro foi (Prioridade: P1) 🎯 MVP

Como Pedro, quero perguntar ao Claude em linguagem natural quanto o casal
gastou em um período, por categoria, e comparar com o período anterior, para
entender o mês sem abrir relatórios nem montar planilha.

**Por que essa prioridade**: é o valor visível e imediato da ideia de
"assistente financeiro", e a única história que entrega algo útil sozinha.
Todas as outras refinam a confiança ou ampliam o alcance dela.

**Teste independente**: com um mês de dados reais no Actual, fazer ao Claude as
perguntas "quanto gastamos por categoria em [mês]?" e "como isso se compara ao
mês anterior?", e conferir os totais contra o relatório do próprio Actual.

**Cenários de aceitação**:

1. **Dado** um mês com despesas categorizadas, **Quando** peço o gasto por
   categoria desse mês, **Então** recebo cada categoria com seu total, e a soma
   bate com o relatório do Actual para o mesmo período.
2. **Dado** dois meses consecutivos com dados, **Quando** peço a comparação,
   **Então** vejo, por categoria, o valor de cada mês e a variação.
3. **Dado** uma categoria específica, **Quando** peço o detalhe dela, **Então**
   vejo as transações que a compõem (data, descrição, valor), das maiores para
   as menores.
4. **Dado** uma transferência entre contas do casal ou o pagamento de uma
   fatura de cartão, **Quando** calculo gastos, **Então** ela **não** aparece
   como despesa nem como receita.
5. **Dado** uma pergunta sobre um período em que não há nenhuma transação,
   **Quando** o Claude consulta, **Então** a resposta diz que não há dados no
   período, em vez de devolver zeros que pareçam um resultado.

---

### História 2 — Saber quanto confiar na resposta (Prioridade: P2)

Como Pedro, quero que toda análise venha acompanhada do quanto os dados estão
completos, e poder pedir a lista do que falta arrumar, para não tomar decisão
em cima de um orçamento furado.

**Por que essa prioridade**: o histórico do projeto é de despesas que não
foram cadastradas. Uma resposta confiante sobre dado incompleto é pior do que
nenhuma resposta. Fica em P2 porque só tem valor depois que a História 1
produz respostas.

**Teste independente**: num mês com transações sem categoria e uma conta sem
atualização recente, pedir o gasto do mês e verificar que a resposta avisa
dessas lacunas; pedir "o que está sem categoria?" e receber a lista.

**Cenários de aceitação**:

1. **Dado** um período com transações sem categoria, **Quando** peço qualquer
   análise desse período, **Então** a resposta informa quantas transações e
   quanto em valor ficaram de fora das categorias.
2. **Dado** uma conta cuja última transação é antiga, **Quando** peço uma
   análise que a inclui, **Então** a resposta avisa que essa conta pode estar
   desatualizada, e desde quando.
3. **Dado** que peço "o que está sem categoria", **Quando** a consulta roda,
   **Então** recebo as transações pendentes com data, descrição e valor, das
   mais caras para as mais baratas.
4. **Dado** transações que parecem duplicadas (mesma data, valor e descrição),
   **Quando** peço a verificação, **Então** elas são listadas como suspeitas, sem
   serem removidas.

---

### História 3 — Ver o que já está comprometido e quanto sobrou (Prioridade: P3)

Como casal, queremos saber quanto ainda vai cair de parcelas e compromissos
agendados e quanto sobra depois deles, para decidir quanto investir.

**Por que essa prioridade**: é a pergunta que mais importa ao casal, mas
depende de parcelas e agendamentos estarem bem registrados (hoje não estão) e
de uma definição de "sobra" que ainda precisa ser decidida.

**Teste independente**: com parcelas e transações agendadas cadastradas,
perguntar "quanto já está comprometido nos próximos três meses?" e conferir
contra a lista de agendadas do Actual.

**Cenários de aceitação**:

1. **Dado** compromissos agendados e parcelas futuras registradas, **Quando**
   peço os próximos meses, **Então** vejo o total comprometido por mês e a
   lista que o compõe.
2. **Dado** um mês fechado, **Quando** peço o que sobrou, **Então** a resposta
   mostra receita, despesa e a diferença entre elas, e declara que "sobra" é
   receita menos despesa.
3. **Dado** que não há parcelas ou agendamentos registrados, **Quando** peço o
   comprometido, **Então** a resposta diz que não há nada registrado — e não
   que não há compromissos.

---

### Casos de Borda

- Orçamento vazio, recém-criado ou só com receitas (o estado real hoje).
- Período que atravessa meses, anos ou datas futuras.
- Categoria renomeada, removida ou agrupada depois de já ter transações.
- Transação dividida (uma compra em várias categorias): conta uma vez por
  categoria, sem duplicar o total.
- Estorno e crédito na fatura: reduzem o gasto, não viram receita.
- Compra parcelada cuja data é a da compra original, não a da cobrança.
- Servidor do Actual fora do ar, senha trocada ou orçamento sem sincronizar.
- Pergunta sobre algo que o sistema não consegue responder (ex.: investimentos
  em corretora, que não estão no Actual): deve dizer que não sabe.
- Pergunta que tentaria alterar dado ("categorize isso para mim"): deve ser
  recusada com explicação de que esta versão só lê.

---

## Requisitos _(obrigatório)_

### Requisitos Funcionais

- **RF-001**: Sistema DEVE permitir que o Claude consulte o gasto de um período
  agrupado por categoria e por grupo de categorias.
- **RF-002**: Sistema DEVE permitir comparar dois períodos, mostrando por
  categoria o valor de cada um e a variação.
- **RF-003**: Sistema DEVE permitir listar as transações de uma categoria, de
  um estabelecimento ou de uma conta em um período, com data, descrição e valor.
- **RF-004**: Sistema NÃO DEVE contabilizar como despesa ou receita
  transferências entre contas próprias nem pagamentos de fatura de cartão.
- **RF-005**: Sistema DEVE permitir listar transações sem categoria, com data,
  descrição e valor.
- **RF-006**: Toda análise de período DEVE vir acompanhada de indicadores de
  completude: quantidade e valor das transações sem categoria, e contas sem
  movimento recente.
- **RF-007**: Sistema DEVE permitir listar possíveis transações duplicadas,
  sem removê-las.
- **RF-008**: Sistema DEVE permitir consultar os compromissos futuros —
  transações agendadas e parcelas registradas — agrupados por mês.
- **RF-009**: Sistema DEVE calcular o que sobrou em um período como **receita
  menos despesa**, sem contar transferências entre contas próprias nem
  pagamento de fatura, e a resposta DEVE declarar essa definição junto com o
  número. A definição é provisória (ver Premissas) e DEVE ser fácil de trocar
  sem reescrever o resto.
- **RF-010**: Sistema DEVE ser **somente leitura**: nenhuma consulta pode
  criar, alterar ou apagar transação, categoria, regra, conta ou orçamento.
- **RF-011**: Sistema DEVE recusar, com explicação, qualquer pedido de
  alteração de dados nesta versão.
- **RF-012**: Sistema NÃO DEVE devolver ao Claude número de conta, número de
  cartão, credencial bancária, token ou senha — somente nome amigável da
  conta e os demais dados que a constituição permite (princípio VIII). O CPF
  que aparece na descrição ou no payee de uma transação **pode** chegar ao
  Claude (constituição 1.2.0, emenda de 2026-10-25), mas NÃO DEVE ser gravado
  em log nem em arquivo do repositório.
- **RF-013**: A senha de acesso ao servidor do Actual e qualquer outra
  credencial DEVEM ficar apenas na máquina do Pedro, fora do repositório e fora
  de qualquer arquivo versionado.
- **RF-014**: Sistema DEVE registrar em log o que foi consultado sem incluir
  descrição de transação, valor ou identificador de usuário.
- **RF-015**: Quando o Actual estiver inacessível ou a autenticação falhar,
  Sistema DEVE informar a causa de forma distinguível (fora do ar, senha
  inválida, orçamento não encontrado) em vez de devolver resposta vazia.
- **RF-016**: Valores DEVEM ser apresentados em reais (BRL), e datas e
  separadores seguem o padrão pt-BR.
- **RF-017**: Sistema DEVE funcionar sem alterar a instalação do Actual em
  produção: nenhuma mudança no servidor da VM é necessária para usá-lo.

### Entidades-Chave

- **Período**: intervalo de datas (mês, trimestre, intervalo livre) sobre o qual
  uma análise é feita.
- **Resumo por categoria**: total gasto por categoria e grupo no período, com a
  comparação ao período anterior quando pedida.
- **Indicador de completude**: o que acompanha qualquer resumo — transações sem
  categoria, contas desatualizadas, possíveis duplicatas.
- **Compromisso futuro**: transação agendada ou parcela registrada, com mês de
  vencimento e valor.
- **Definição de sobra**: a regra de como calcular "quanto sobrou". Hoje é
  receita menos despesa; deve ser exibida junto com o número.

---

## Critérios de Sucesso _(obrigatório)_

- **CS-001**: O Pedro obtém a resposta de "quanto gastamos por categoria em
  [mês]" em menos de 30 segundos a partir de uma pergunta em português ao
  Claude.
- **CS-002**: Os totais por categoria de um mês fechado batem, ao centavo, com o
  relatório do próprio Actual para o mesmo período.
- **CS-003**: Nenhuma transferência entre contas do casal nem pagamento de fatura
  aparece como despesa em qualquer resposta.
- **CS-004**: 100% das respostas de análise informam o período consultado e o
  quanto dos dados está sem categoria.
- **CS-005**: Após uma sessão inteira de uso, nenhuma transação, categoria ou
  regra do orçamento foi alterada — verificável comparando o orçamento antes e
  depois.
- **CS-006**: O custo adicional de IA para usar a feature é zero, além da
  assinatura do Claude que o Pedro já paga.
- **CS-007**: Nenhuma credencial existe no repositório nem nos logs — verificável
  por inspeção.
- **CS-008**: O Pedro consegue configurar a ponte do zero, seguindo apenas a
  documentação, em menos de 15 minutos.

---

## Fora de Escopo

- **Qualquer escrita**: categorizar em lote, criar regras nativas, editar ou
  apagar transação. É a spec seguinte, e depende de `003` (camada determinística)
  e do desenho de confirmação.
- Captura de despesas: sincronização do cartão (`002`), lançamento rápido
  (`006`) e carga histórica (`007`).
- Classificação por IA no servidor do Actual (`004`).
- Detecção automática de transferências, parcelamentos e aportes (`008`). Esta
  feature usa o que já estiver identificado no Actual; não corrige o que não
  estiver.
- Resumo mensal automático e insights proativos (`009`). Aqui o Claude responde
  quando perguntado.
- Investimentos em corretora e qualquer dado que não esteja no Actual.
- Uso pela Julia ou por outros clientes de IA (Claude Desktop, celular). Pode
  funcionar, mas não é requisito desta versão.
- Instalação na VM de produção.

---

## Premissas

- **"Sobra para investir" = receita menos despesa** (decisão do Pedro em
  2026-10-18). É uma definição provisória: o casal pretende desenvolver um
  racional melhor depois (por exemplo, considerando reservas e compromissos), e
  isso deve ser ajustado na camada do assistente, sem refazer a leitura dos dados.
- **Quem usa**: somente o Pedro, pelo Claude Code na sua própria máquina. A
  Julia continua consultando pelo Actual. O desenho não deve impedir ampliar
  isso depois.
- **Dados saem da máquina**: descrição, valor, data, categoria e nome do payee
  são enviados ao Claude, o que a constituição já permite para provider de IA
  (princípio VIII-a). Os usuários aceitaram isso (`specs/000-produto/spec.md`,
  Premissas).
- **Origem dos dados**: o próprio orçamento do Actual, alimentado por import
  manual e, quando existir, pela sincronização do cartão (`002`). A feature não
  tem fonte de dados própria.
- **A qualidade da análise é limitada pela qualidade do registro**: se as
  despesas não entram, nenhuma consulta as inventa. Por isso a História 2 existe.
- **Atualidade**: as respostas refletem o orçamento como estava na última
  sincronização feita pela máquina do Pedro; não é tempo real.
- **Solução existente**: já existe um servidor MCP de código aberto para o Actual
  (`agigante80/actual-mcp-server`, licença MIT, com modo somente leitura).
  Adotá-lo, adaptá-lo ou escrever um próprio é decisão do `/speckit.plan`,
  avaliada contra os requisitos acima — em especial RF-004, RF-006 e RF-012,
  que um servidor genérico provavelmente não cumpre sozinho.
- **Volume**: centenas de transações por mês. Não há requisito de desempenho
  além de resposta em segundos.
- **Moeda e idioma**: BRL e pt-BR; as categorias do orçamento já são em
  português.

---

## Impacto na Constituição

- **Princípio IV — IA plugável e barata**: a feature é a "rota preferida" que o
  princípio descreve — o Claude Code pela assinatura já paga, sem API por token.
  Em conformidade.
- **Princípio V — Orçamento da VM**: roda fora da VM e não adiciona processo nem
  dependência ao servidor. O plano DEVE confirmar que o acesso do cliente não
  sobrecarrega a `e2-micro` (RF-017).
- **Princípio II — Compatibilidade com upstream**: o plano DEVE preferir código
  em diretório custom ou pacote próprio e não editar arquivo do upstream.
- **Princípio VIII — Privacidade explícita**: a feature envia dados do casal a
  um provider de IA. RF-012, RF-013 e RF-014 existem para manter isso dentro do
  que a constituição permite. O plano DEVE declarar em `infra/README.md` que o
  Claude passa a receber esses dados.
- **Princípio VII — Teste para toda lógica custom**: cálculos de gasto, exclusão
  de transferências e indicadores de completude são lógica de negócio e exigem
  teste escrito antes. A garantia de CS-005 (nada é alterado) também deve virar
  teste.
- **Princípio III — Determinístico antes de IA**: não se aplica diretamente,
  porque esta versão não classifica nada. A spec seguinte, de escrita, vai
  precisar respeitá-lo.
