# Especificação: Acesso remoto e pelo celular ao assistente financeiro

**Branch**: `010-acesso-remoto-mcp`
**Criada em**: 2026-10-25
**Status**: Rascunho — escopo ampliado com **escrita** em 2026-10-25; a escrita depende de **emenda ao princípio III** (ver _Impacto na Constituição_). Leitura e acesso remoto (histórias 1–3) não dependem dela
**Entrada**: Descrição do usuário (ampliada duas vezes em 2026-10-25 — ver _Clarificações_): "Quero usar o assistente financeiro (a ponte MCP somente leitura da spec 005) também do celular, configurando um conector no Claude (claude.ai e app), com credenciais fáceis." Ampliação posterior: "quero que o MCP também possa escrever, para eu poder categorizar as coisas pelo Claude e etc."

---

## Contexto

A spec `005` entregou a **ponte**: o Claude consulta o orçamento do casal, em
linguagem natural, sem alterar nada. Esta spec **acrescenta a escrita** (decisão do
Pedro): o Claude também passa a categorizar, lançar, editar e apagar, para arrumar o
orçamento conversando. Hoje ela só funciona **no Mac do Pedro**,
dentro do Claude Code: o programa roda na própria máquina e a credencial fica no
Chaveiro dela. Fora do Mac — no celular, no navegador, no app do Claude — o
assistente financeiro não existe.

Esta feature leva o mesmo assistente para onde o casal realmente está: **o
celular**. A constituição já diz que o mobile importa mais que o desktop; perguntar
"quanto sobrou este mês?" no mercado, no ônibus ou na conversa com a Julia é o uso
que mais se parece com a vida real.

Três fatos moldam o problema e precisam estar claros desde o início:

1. **"Credenciais fáceis" não pode significar "dado financeiro exposto atrás de
   um segredo fraco".** Um conector remoto é um endereço que a internet inteira
   consegue tentar abrir, e por trás dele está o dinheiro de duas pessoas. Fácil
   aqui quer dizer: **nada para decorar, nada para copiar e colar, nada para
   digitar no celular** — entrar com a conta que o casal já usa e pronto. Não
   quer dizer uma senha única, fixa e compartilhada.
2. **A produção do Actual entra por conta Google, sem senha de servidor.** A
   ponte local contorna isso com um token de sessão guardado no Chaveiro, que é
   _equivalente a uma senha_ e por isso **não pode** ser colado numa tela de
   configuração do Claude nem sair do ambiente do casal.
3. **Quem chama o conector é o Claude, não o celular.** O pedido parte dos
   servidores do próprio Claude, então o acesso precisa ser alcançável pela
   internet — e é exatamente essa exposição que a feature tem que proteger.

Um quarto fato vem da escrita, e o Pedro o assumiu de olhos abertos:

4. **O Claude lê texto de terceiros** (descrições de extrato, nomes de
   estabelecimento) **e agora também escreve**. Um texto malicioso numa descrição
   poderia tentar induzi-lo a apagar ou alterar dados. Por decisão do Pedro, o
   servidor **não bloqueia** nem exige aprovação fora da conversa: ele **devolve
   mensagens de risco** e é a **IA que avalia** quando deve pedir confirmação. O
   risco que sobra — sem escopo separado, sem teto de volume e **sem desfazer** — é
   dele, e fica registrado aqui para não ser esquecido.

Esta spec descreve **o que** o casal precisa e **que garantias de segurança** o
acesso remoto deve cumprir. **Onde** isso roda (nuvem com escala a zero, o Mac do
Pedro com túnel, ou outra coisa) é decisão do `/speckit.plan`, não desta spec.

---

## Cenários de Usuário e Testes _(obrigatório)_

### História 1 — Perguntar do celular o mesmo que se pergunta no Mac (Prioridade: P1) 🎯 MVP

Como Pedro, quero cadastrar o assistente financeiro uma única vez como conector
no Claude e, a partir daí, fazer pelo celular as mesmas perguntas que faço no
Mac, recebendo as mesmas respostas, para consultar as finanças em qualquer lugar
sem abrir o computador.

**Por que essa prioridade**: é a razão de existir da feature. Inclui a
autenticação porque um acesso remoto sem identidade comprovada não pode ser
entregue nem em versão mínima — a segurança faz parte do MVP, não é refinamento.

**Teste independente**: com o conector cadastrado no celular, perguntar "quanto
gastamos por categoria em [mês]?" e "o que está sem categoria?", e conferir que os
números são os mesmos que o Claude Code no Mac devolve para a mesma pergunta.

**Cenários de aceitação**:

1. **Dado** que nunca configurei o conector, **Quando** o cadastro no Claude e
   autorizo entrando com a minha conta, **Então** o assistente passa a responder no
   celular sem que eu tenha digitado, copiado ou colado nenhuma senha, chave ou
   token.
2. **Dado** o conector ativo, **Quando** pergunto no celular o gasto por categoria
   de um mês, **Então** recebo os mesmos totais, os mesmos indicadores de completude
   (sem categoria, conta desatualizada) e a mesma definição de "sobra" que o Mac
   devolve.
3. **Dado** o conector ativo, **Quando** peço no celular para alterar algo
   ("categorize isso para mim"), **Então** o pedido segue o fluxo da História 4
   (escrita com mensagens de risco).
4. **Dado** uma descrição de transação que contém um CPF, CNPJ, número de cartão ou
   de conta, **Quando** ela aparece numa resposta no celular, **Então** o número
   chega mascarado, exatamente como no Mac.
5. **Dado** que alguém — sem ser o casal — descobre o endereço do conector, **Quando**
   tenta consultá-lo sem autorização, **Então** recebe recusa e nenhum dado
   financeiro, nem sequer a confirmação de que existe um orçamento por trás.
6. **Dado** uma conta válida que **não** está na lista de pessoas autorizadas,
   **Quando** ela tenta autorizar o conector, **Então** é recusada, sem acesso a dado
   algum.
7. **Dado** que o Actual de produção está fora do ar, **Quando** pergunto pelo
   celular, **Então** a resposta diz que o orçamento está inacessível, de forma
   distinta de "não autorizado" e de "acesso expirado".

---

### História 2 — Encerrar ou renovar um acesso em minutos (Prioridade: P2)

Como Pedro, quero ver quais acessos remotos estão ativos e encerrar qualquer um —
ou todos — em poucos minutos, para reagir a um celular perdido, a um endereço
vazado ou a uma suspeita, sem depender de ter o aparelho em mãos.

**Por que essa prioridade**: é o que torna aceitável deixar dados financeiros
atrás de um endereço público. Fica em P2 porque só faz sentido depois de a
História 1 existir, mas **a feature não deve ser considerada pronta para uso real
sem ela**.

**Teste independente**: com um acesso ativo no celular, encerrá-lo pelo
computador e verificar que a próxima pergunta feita no celular é recusada; depois
reautorizar e verificar que volta a funcionar.

**Cenários de aceitação**:

1. **Dado** um ou mais acessos ativos, **Quando** peço a lista, **Então** vejo para
   cada um um rótulo reconhecível (ex.: "celular do Pedro"), quando foi concedido e
   quando foi usado pela última vez.
2. **Dado** um acesso ativo, **Quando** o encerro, **Então** a próxima consulta
   feita por ele é recusada em até 5 minutos e os demais acessos continuam
   funcionando.
3. **Dado** que perdi o celular, **Quando** uso a ação de "encerrar todos os
   acessos" a partir do computador, **Então** nenhum aparelho consegue mais
   consultar até nova autorização, sem eu precisar do aparelho perdido.
4. **Dado** que uma pessoa é retirada da lista de autorizadas, **Quando** isso
   acontece, **Então** todos os acessos que ela tinha deixam de funcionar.
5. **Dado** um acesso que ficou muito tempo sem uso, **Quando** o prazo de
   inatividade vence, **Então** ele expira sozinho e reativá-lo exige apenas uma
   nova autorização rápida, sem reconfigurar o conector.
6. **Dado** o histórico de acessos, **Quando** o consulto, **Então** vejo quando
   cada acesso consultou o assistente e se foi permitido ou recusado — sem ver o
   conteúdo das perguntas, nem descrições ou valores.

---

### História 3 — A Julia também consegue usar (Prioridade: P3)

Como Julia, quero ter o assistente financeiro no meu celular, entrando com a
minha própria conta, para consultar as finanças do casal sem pedir ao Pedro.

**Por que essa prioridade**: a constituição prevê dois usuários, mas hoje só o
Pedro opera o assistente (a Julia consulta pelo Actual). O Pedro confirmou que ela usa já nesta versão (ver _Clarificações_).

**Teste independente**: com a Julia na lista de autorizadas, ela cadastra o
conector no próprio celular, pergunta o gasto do mês e recebe o mesmo resultado
que o Pedro; o acesso dela pode ser encerrado sem afetar o do Pedro.

**Cenários de aceitação**:

1. **Dado** a Julia na lista de autorizadas, **Quando** ela cadastra o conector e
   autoriza com a conta dela, **Então** passa a consultar o mesmo orçamento do
   casal, com as mesmas garantias de mascaramento e as mesmas mensagens de risco nas escritas.
2. **Dado** acessos do Pedro e da Julia ativos, **Quando** encerro só o dela,
   **Então** o do Pedro continua funcionando, e vice-versa.
3. **Dado** a Julia usando o assistente, **Quando** o Pedro consulta o histórico de
   acessos, **Então** consegue distinguir qual acesso (pelo rótulo) fez cada
   consulta.

---

### História 4 — Arrumar o orçamento conversando com o Claude (Prioridade: P4)

Como Pedro (e como Julia), quero pedir ao Claude, do celular ou do Mac, que
**categorize transações, lance despesas, ajuste e apague o que estiver errado** —
inclusive regras, categorias, contas e valores do orçamento mensal — para tratar o
atrito de registro na própria conversa, sem abrir o Actual.

**Por que essa prioridade**: é o que transforma o assistente de "olhar" em
"resolver", e ataca o problema central do produto (despesas que não entram). Fica em
P4 porque só pode ser entregue depois de o acesso remoto e a revogação existirem
(histórias 1 e 2): escrever por um endereço público sem poder cortar o acesso seria
imprudente. **Depende da emenda ao princípio III** (ver _Impacto na Constituição_).

**Teste independente**: no Actual de teste, pedir ao Claude para categorizar um
grupo de transações sem categoria, lançar uma despesa nova e apagar uma transação
de teste; conferir no próprio Actual (app) que as alterações aparecem, e que cada
resposta de escrita trouxe a avaliação de risco.

**Cenários de aceitação**:

1. **Dado** transações sem categoria, **Quando** peço "categorize as que tiver
   certeza", **Então** o Claude propõe ou grava conforme a própria avaliação de risco
   e confiança, e o resultado aparece no Actual em até 1 minuto.
2. **Dado** que eu confirmei categorizações para um mesmo estabelecimento, **Quando**
   peço para lembrar disso, **Então** uma regra nativa do Actual é criada e as
   próximas transações dele já chegam categorizadas (camada determinística).
3. **Dado** que digo "gastei 45 no mercado hoje", **Quando** o Claude entende, **Então**
   a despesa é lançada na conta e categoria certas, sem eu abrir o Actual.
4. **Dado** um pedido de **apagar** uma transação, uma conta, uma categoria com
   histórico ou uma regra, **Quando** a ferramenta é chamada, **Então** a resposta
   classifica o risco como alto, avisa se é irreversível e diz o que foi afetado.
5. **Dado** uma operação de risco médio ou alto (apagar, editar valor ou data,
   sobrescrever categoria existente, lote grande, mexer em conta ou orçamento),
   **Quando** o Claude a considera, **Então** a descrição da ferramenta e a mensagem
   de risco o orientam a **confirmar com o usuário na conversa** antes de gravar —
   quem decide é a IA, com base nas mensagens.
6. **Dado** uma descrição de transação com texto que tenta mandar o assistente
   "apagar tudo" ou "ignorar as regras", **Quando** o Claude a lê, **Então** as
   mensagens de risco e a orientação do servidor tratam esse texto como dado do
   extrato, não como instrução (o servidor não consegue impedir sozinho; ver risco
   aceito).
7. **Dado** qualquer escrita feita, **Quando** consulto o histórico, **Então** vejo
   que operação foi feita, quantas linhas, o nível de risco e por qual acesso (pelo
   rótulo) — sem descrição nem valores.
8. **Dado** uma escrita pedida com dados inválidos (categoria inexistente, conta
   fechada, data inválida), **Quando** a ferramenta roda, **Então** nada é gravado e
   a mensagem diz o que corrigir.

---

### Casos de Borda

- **Celular perdido ou roubado**: encerrar aquele acesso, ou todos, sem o aparelho
  (História 2).
- **Endereço do conector vazado**: sozinho, não dá acesso a nada; sem autorização
  válida, a resposta é a mesma de qualquer estranho.
- **Conta da Julia ou do Pedro comprometida**: retirar da lista de autorizadas
  encerra tudo daquela pessoa.
- **Autorização expira no meio de uma conversa**: o assistente avisa que o acesso
  expirou e como renovar, em vez de falhar em silêncio ou devolver resposta vazia.
- **Tentativas repetidas e falhas**: devem ser freadas e registradas, sem permitir
  adivinhação por força bruta.
- **Rajada de perguntas** (cliente com defeito ou abuso): não pode degradar o
  Actual em produção para quem o está usando.
- **Dois aparelhos da mesma pessoa** (celular e tablet): cada um é um acesso
  separado, encerrável individualmente.
- **Acesso simultâneo local (Mac) e remoto (celular)**: ambos funcionam; um não
  derruba o outro.
- **Alteração pedida de qualquer cliente**: segue a História 4; não há mais recusa
  por ser "só leitura".
- **Apagar é irreversível**: não há "desfazer" (decisão do Pedro). O único socorro é
  o backup diário do SQLite da VM; a mensagem de risco deve dizer isso.
- **Lote enorme** (centenas de linhas numa chamada): sem teto no servidor; a
  mensagem de risco cresce com o tamanho e o histórico registra a quantidade.
- **Edição simultânea** no app do Actual e pelo Claude: vale a regra de sincronização
  do próprio Actual; a resposta informa o instante da última sincronização.
- **Aparelho vazado com poder de escrita**: sem escopo separado, um acesso
  comprometido pode alterar dados até ser encerrado — por isso a rapidez da
  História 2 e a mensagem de risco no histórico importam mais agora.
- **Texto malicioso numa descrição** tentando disparar escrita (História 4,
  cenário 6).
- **Pergunta que o sistema não sabe responder** (investimentos em corretora):
  responde que não sabe, como no Mac.
- **Orçamento recém-atualizado**: a resposta no celular não pode ser mais
  desatualizada que a do Mac para o mesmo momento.
- **Mensagem de erro**: nunca revela endereço interno, credencial, versão de
  componente nem trecho de dado.

---

## Requisitos _(obrigatório)_

### Requisitos Funcionais

**Uso pelo celular**

- **RF-001**: Sistema DEVE permitir que o assistente financeiro seja cadastrado
  uma única vez como conector no Claude e usado a partir do celular (app) e do
  navegador (claude.ai).
- **RF-002**: Sistema DEVE responder remotamente a todas as perguntas que a spec
  `005` responde localmente — gasto por categoria, comparação de períodos, detalhe
  de transações, sem categoria, possíveis duplicatas, compromissos futuros e
  sobra — com os mesmos resultados e os mesmos indicadores de completude.
- **RF-003**: O uso local no Mac (spec `005`) DEVE continuar funcionando para
  consulta como hoje, sem alteração de comportamento nem de configuração. As
  ferramentas de escrita (RF-029) valem **nos dois caminhos**, porque o servidor é o
  mesmo.

**Identidade e autorização**

- **RF-004**: Sistema NÃO DEVE entregar nenhum dado financeiro a quem não tenha
  identidade comprovada: toda requisição sem autorização válida DEVE ser recusada,
  sem dado e sem indício de que existe um orçamento por trás.
- **RF-005**: A pessoa DEVE se identificar com a mesma conta que já usa para entrar
  no Actual, sem criar senha nova e sem digitar, copiar ou colar qualquer
  segredo.
- **RF-006**: Somente pessoas numa lista explícita de autorizadas (no máximo as
  duas do casal) DEVEM conseguir acesso. Uma conta válida que não esteja na lista
  DEVE ser recusada.
- **RF-007**: A autorização DEVE poder ser concluída pelo próprio fluxo de
  cadastro de conector do Claude (tela de entrada e consentimento), sem passo
  manual fora dele.
- **RF-008**: Todo acesso DEVE expirar por inatividade; ao expirar, a renovação DEVE
  ser uma nova autorização rápida, sem reconfigurar o conector.
- **RF-009**: A credencial permanente do Actual (token de sessão, senha, senha de
  criptografia do orçamento) NUNCA DEVE ser entregue ao Claude nem ao celular, nem
  ser pedida numa tela de configuração do conector.

**Privacidade**

- **RF-010**: _(substituído pela escrita; ver RF-029 a RF-035.)_ As ferramentas de
  **consulta** continuam sem efeito colateral: nenhuma delas altera dado.
- **RF-011**: _(removido.)_ O pedido de alteração deixou de ser recusado.
- **RF-012**: Sistema DEVE mascarar CPF, CNPJ, número de cartão e de conta em toda
  resposta remota, **independentemente do cliente** que faz a pergunta (não pode
  depender de uma configuração do Claude ou do aparelho).
- **RF-013**: Sistema NÃO DEVE devolver ao Claude número de conta, número de
  cartão, CPF, credencial bancária, token, senha nem e-mail dos usuários — apenas
  os dados que o princípio VIII-a da constituição permite.

**Revogação e controle**

- **RF-014**: Sistema DEVE permitir listar os acessos ativos, cada um com rótulo
  reconhecível, data de concessão e data do último uso.
- **RF-015**: Sistema DEVE permitir encerrar um acesso individual, e o efeito DEVE
  valer na consulta seguinte, em no máximo 5 minutos.
- **RF-016**: Sistema DEVE permitir encerrar todos os acessos de uma só vez,
  executável a partir do computador, sem precisar do aparelho que se quer
  bloquear.
- **RF-017**: Retirar uma pessoa da lista de autorizadas DEVE encerrar todos os
  acessos dela.
- **RF-018**: Encerrar, renovar ou rotacionar acesso NÃO DEVE exigir nova versão do
  sistema nem alteração de código.

**Proteção e rastreabilidade**

- **RF-019**: Sistema DEVE frear tentativas repetidas de acesso sem sucesso e
  limitar o volume de consultas por acesso, de modo que abuso ou defeito de um
  cliente não degrade o Actual em produção.
- **RF-020**: Sistema DEVE registrar cada requisição remota com instante, rótulo do
  acesso, tipo de consulta e resultado (permitida ou recusada), **sem** descrição
  de transação, valor, e-mail ou identificador de usuário (princípio VIII). As escritas
  seguem o RF-034.
- **RF-021**: Nenhum segredo (credencial do Actual, chave de assinatura, segredo de
  cliente) DEVE existir no repositório, em log, em mensagem de erro ou em resposta
  ao Claude.
- **RF-022**: Quando o assistente não puder responder, a mensagem DEVE distinguir,
  em pt-BR e sem vazar detalhe interno: acesso não autorizado, acesso expirado,
  limite de uso atingido, Actual inacessível e assistente fora do ar.

**Disponibilidade, custo e operação**

- **RF-023**: Sistema DEVE estar disponível pelo celular **a qualquer hora (24h)**,
  inclusive com o Mac do Pedro desligado ou fora da rede. Pequenas indisponibilidades
  de manutenção são aceitáveis; depender do Mac ligado não é.
- **RF-024**: O custo mensal adicional de operar o acesso remoto DEVE ser de **no
  máximo R$ 20** (decisão do Pedro). Passar disso exige nova decisão explícita.
- **RF-025**: Sistema NÃO DEVE degradar o uso do Actual pelo casal em produção: o
  acesso remoto não pode aumentar o consumo da VM além do que o princípio V
  permite, e esse impacto DEVE ser medido antes de a feature ser dada como pronta.
- **RF-026**: Todo terceiro novo que passe a receber ou intermediar dados por causa
  desta feature (hospedagem, identidade, o próprio Claude como destino das
  respostas) DEVE estar declarado em `infra/README.md`.
- **RF-027**: A Julia DEVE conseguir ter o próprio acesso, independente do do
  Pedro, já nesta versão.
- **RF-028**: O acesso DEVE seguir o **padrão aberto** de conectores MCP remotos
  (transporte HTTP e autorização padrão), sem lógica específica de um fornecedor de
  IA, de modo que **qualquer cliente de IA compatível** — não só o Claude — consiga
  conectar com o mesmo passo simples: informar o endereço, entrar com a conta e
  autorizar. Acrescentar um cliente novo NÃO DEVE exigir mudança de código.

**Escrita** _(decisões do Pedro, 2026-10-25 — ver *Clarificações*)_

- **RF-029**: Sistema DEVE oferecer ferramentas de escrita sobre o orçamento do
  Actual cobrindo **criar, editar e apagar** para: transações (incluindo categorizar
  em lote), regras, categorias e grupos de categorias, contas (criar, renomear,
  fechar, reabrir, apagar) e valores do orçamento mensal por categoria.
- **RF-030**: Toda ferramenta de escrita DEVE declarar, na própria descrição, o seu
  **nível de risco** (baixo, médio ou alto) e se a operação é **irreversível**, para
  que o assistente avalie **antes** de chamar.
- **RF-031**: Toda resposta de escrita DEVE trazer **mensagens de risco**
  (classificação, motivo, irreversibilidade) e o **efeito** da operação (quantas
  linhas foram criadas, alteradas ou apagadas), em pt-BR. O servidor **não bloqueia**
  a operação por causa do risco: quem avalia e decide quando pedir confirmação ao
  usuário é a IA.
- **RF-032**: Sistema DEVE oferecer, em toda ferramenta de escrita, a possibilidade
  **opcional** de **simular** a operação (mostrar o efeito sem gravar). Usar a
  simulação é escolha da IA; o servidor não a exige.
- **RF-033**: Sistema DEVE orientar o assistente (instruções do servidor) a tratar
  texto de descrições e nomes vindos do extrato como **dado**, nunca como instrução,
  e a confirmar com o usuário, na conversa, as operações de risco médio ou alto.
- **RF-034**: Sistema DEVE registrar cada escrita no histórico de auditoria com o
  instante, o rótulo do acesso, o tipo de operação, a quantidade de linhas e o nível
  de risco — **sem** descrição, valor ou identificador de usuário (princípio VIII).
- **RF-035**: Pedro e Julia DEVEM poder escrever, cada um pelos próprios acessos.
  Não há escopo de escrita separado, teto de volume nem função de desfazer nesta
  versão (decisão do Pedro); o plano DEVE registrar isso como **risco aceito**.
- **RF-036**: Sistema DEVE refletir cada escrita no Actual de forma que apareça para o
  casal no aplicativo em até 1 minuto, pelo mecanismo normal de sincronização do
  Actual.
- **RF-037**: Sistema DEVE oferecer um **interruptor operacional** que desliga todas
  as escritas de uma vez (mantendo as consultas), sem alterar código. Não afeta o
  uso normal; existe para emergência.

### Entidades-Chave

- **Pessoa autorizada**: alguém da lista curta do casal que pode conceder acesso.
  Identificada pela conta que já usa no Actual.
- **Acesso**: a concessão feita por uma pessoa autorizada a um aparelho ou cliente
  específico (ex.: "celular da Julia"). Tem rótulo, data de concessão, último uso,
  prazo de inatividade e estado (ativo, expirado, encerrado). É a unidade que se
  lista, renova e encerra.
- **Conector**: o cadastro do assistente dentro do Claude. Sozinho não dá acesso a
  nada — só se completa com uma autorização de pessoa autorizada.
- **Registro de acesso**: linha do histórico com instante, rótulo do acesso, tipo
  de consulta e resultado. Nunca guarda conteúdo da conversa nem dados
  financeiros.
- **Lista de autorizadas**: quem pode conceder acesso. Mexer nela afeta todos os
  acessos da pessoa.
- **Operação de escrita**: uma chamada que cria, altera ou apaga dados do orçamento.
  Tem tipo, alvo, quantidade de linhas, nível de risco e indicação de
  irreversibilidade.
- **Mensagem de risco**: aviso devolvido pela ferramenta (nível baixo, médio ou
  alto, motivo, se é irreversível) para a IA avaliar e, se achar necessário, pedir
  confirmação ao usuário.

---

## Critérios de Sucesso _(obrigatório)_

- **CS-001**: O Pedro configura o conector do zero no celular, seguindo só a
  documentação, em menos de 10 minutos e sem digitar nem colar nenhum segredo.
- **CS-002**: A primeira pergunta depois de uma autorização nova é respondida em
  menos de 30 segundos; as seguintes, em segundos.
- **CS-003**: Para a mesma pergunta e o mesmo estado do orçamento, os totais
  devolvidos pelo celular batem, ao centavo, com os do Mac.
- **CS-004**: 100% das tentativas de consulta sem autorização válida, ou de pessoa
  fora da lista, terminam em recusa sem nenhum dado financeiro — verificável com
  uma bateria de tentativas (sem credencial, credencial expirada, credencial
  encerrada, conta fora da lista).
- **CS-005**: Depois de encerrar um acesso, a consulta seguinte por ele falha em no
  máximo 5 minutos em 100% dos casos testados.
- **CS-006**: "Encerrar todos os acessos" torna todo aparelho inoperante em no
  máximo 5 minutos, sem o aparelho em mãos.
- **CS-007**: Após uma sessão de uso remoto **só de consulta**, nenhuma transação,
  categoria, regra, conta ou orçamento foi alterado — verificável comparando o
  orçamento antes e depois. As ferramentas de consulta não têm efeito colateral.
- **CS-008**: Nenhum segredo existe no repositório, nos logs nem nas respostas —
  verificável por inspeção e por busca automatizada.
- **CS-009**: Nenhuma resposta remota contém CPF, CNPJ, número de cartão ou de
  conta sem máscara, num conjunto de casos de teste com formatos variados.
- **CS-010**: O uso do Actual pelo casal em produção não sofre degradação
  perceptível enquanto o acesso remoto é usado, e o consumo da VM fica dentro do
  limite da constituição.
- **CS-011**: O custo mensal adicional respeita o teto definido pelo Pedro.
- **CS-012**: O assistente conecta e responde a uma pergunta de gasto em pelo menos
  **dois clientes de IA de fornecedores diferentes** (o Claude e ao menos um que não
  seja do Claude), com o mesmo procedimento de cadastro e sem alterar o servidor.
- **CS-013**: Do celular, o casal categoriza 20 transações sem categoria em menos de
  2 minutos de conversa e as alterações aparecem no Actual em até 1 minuto (CS de
  escrita ligado ao atrito de registro).
- **CS-014**: 100% das respostas de ferramentas de escrita trazem nível de risco,
  irreversibilidade e efeito, e 100% das descrições das ferramentas declaram o risco
  — verificável por teste automatizado.
- **CS-015**: 100% das escritas aparecem no histórico de auditoria com tipo,
  quantidade e risco, e nenhuma linha do histórico contém descrição, valor, e-mail
  ou IP — verificável por teste automatizado.
- **CS-016**: Nenhuma operação de **consulta** altera dados, e o interruptor de
  escrita desligado faz **todas** as ferramentas de escrita falharem com mensagem
  clara, mantendo as consultas funcionando.

---

## Clarificações

### Sessão 2026-10-25

- P: O assistente precisa responder 24h ou aceita só com o Mac ligado? → R: **24h**
  (RF-023).
- P: Qual o teto de custo mensal adicional? → R: **até R$ 20/mês** (RF-024).
- P: A Julia usa já nesta versão? → R: **Sim** (RF-027); a História 3 permanece no
  escopo.
- Direcionamento adicional do Pedro (ao pedir o plano): o assistente deve ser um
  **MCP por HTTP com autenticação**, funcionando **de forma simples em qualquer
  provedor de IA**, e a esteira de implantação em Cloud Run pode se inspirar na que
  ele já usa em outro repositório. → RF-028 e CS-012; a escolha de implantação segue
  no plano.

### Sessão 2026-10-25 (2) — escrita pelo MCP

- P: O que o Claude poderá escrever? → R: **Tudo, inclusive apagar e editar**
  (transações, regras, categorias/grupos, contas, orçamento mensal) — RF-029.
- P: Como uma escrita é confirmada? → R: **Sem confirmação imposta pelo servidor.** O
  MCP só devolve mensagens de risco e a **própria IA avalia** quando pedir
  confirmação — RF-030 a RF-033. _Observação do plano de segurança: isso deixa a
  proteção contra texto malicioso dependente do modelo._
- P: Quais travas sem atrito o servidor mantém? → R: **Nenhuma** (sem escopo de
  escrita separado, sem teto de lote, sem diário de desfazer) — RF-035, risco aceito.
  _Acrescentado como consequência, não pedido: interruptor operacional de escrita
  (RF-037) e registro de auditoria da escrita (RF-034), que não afetam o uso normal._
- P: Quem pode escrever? → R: **Pedro e Julia** — RF-035.
- P: Como cumprir o princípio III? → R: **Emendar o princípio III** para permitir que
  a IA decida com base nas mensagens de risco, sem limiar nem confirmação imposta.
  Pré-requisito da História 4 (ver _Impacto na Constituição_).

---

## Fora de Escopo

- **Escrita fora da lista do RF-029**: apagar o arquivo inteiro do orçamento, mexer
  em usuários, compartilhamento ou senha do servidor do Actual, e importar ou
  sincronizar com banco (a `002` e a `006` cuidam da captura automática).
- **Desfazer, escopo de escrita separado e teto de volume**: recusados pelo Pedro
  nesta versão (RF-035). Se um dia forem pedidos, são mudança de spec.
- **Confirmação imposta pelo servidor** (aprovação fora da conversa): recusada pelo
  Pedro; a avaliação fica com a IA (RF-031).
- **Mudar o jeito de o casal entrar no Actual** (continua login Google, sem senha
  de servidor) nem trocar a produção para senha.
- **App nativo em loja**: o uso é pelo app do Claude, que já existe; a constituição
  veda app próprio publicado.
- **Clientes de IA que não suportam autorização padrão** (só aceitam uma chave
  fixa colada em configuração): ficam de fora. Oferecer uma "chave pessoal" como
  alternativa seria uma decisão à parte, pesando a segurança de uma credencial
  duradoura.
- **Garantia de compatibilidade com todo cliente existente**: o requisito é seguir o
  padrão aberto (RF-028) e validar com dois clientes (CS-012), não testar todos.
- **Pessoas além do casal**: sem convidados, amigos, contador ou multi-tenant.
- **Novas perguntas, novos dados e novas análises de leitura**: o conjunto de
  perguntas é o da `005`. Resumo automático e insights proativos são a `009`.
- **Captura automática de despesas** (`002`, `006`, `007`) e **classificação por IA no
  servidor do Actual** (`003`, `004`). Aqui a IA que classifica é o Claude do próprio
  casal, na conversa, e o servidor só executa a escrita.
- **Acesso público sem autenticação**, mesmo só para consulta e mesmo "só por
  algumas horas".
- **Segredo estático compartilhado** (chave de API fixa) como forma de entrada.

---

## Premissas

- **A base é a `005`**: ferramentas, máscara, definição de "sobra" e protocolo de
  resposta são os mesmos. Esta spec trata de _como chegar_ a eles de fora do Mac,
  não de _o que_ responder. A máscara já roda dentro do servidor (Emenda D-1 da
  `005`), o que a torna válida para qualquer cliente.
- **Produção usa login Google (OpenID), sem senha de servidor** — fato registrado
  na Emenda D-1 da `005`. A ponte local usa token de sessão no Chaveiro; esse token
  é equivalente a uma senha e é o motivo do RF-009.
- **Padrão de autenticação do conector**: o Claude exige que conectores remotos
  usem o fluxo padrão de autorização por tela de login e consentimento (OAuth).
  Por isso "credencial fácil" aqui significa entrar com a conta existente, não
  inventar um segredo próprio. Como realizar isso é decisão do plano.
- **Quem chama é o Claude**: o conector é acessado a partir dos servidores do Claude,
  então precisa ser alcançável pela internet. As respostas passam pela Anthropic,
  o que a constituição já permite (princípio VIII-a) e os usuários já aceitaram
  (`specs/000-produto/spec.md`).
- **Prazo de inatividade**: 30 dias sem uso expira o acesso. É um padrão razoável
  para um aparelho pessoal e pode ser ajustado no plano.
- **Rótulo do acesso**: um apelido que o casal escolhe ("celular do Pedro"). Serve
  ao registro de acesso sem violar a regra de log sem identificador de usuário
  (princípio VIII).
- **Lista de autorizadas**: começa com o Pedro e a Julia (decisão do Pedro). O tamanho máximo é dois.
- **Atualidade dos dados**: a mesma da `005` — reflete o orçamento da última
  sincronização — e declarada na resposta. O acesso remoto não pode ser menos
  atual que o local.
- **Escala**: duas pessoas, algumas dezenas de perguntas por dia. Sem requisito de
  desempenho além de resposta em segundos.
- **Escrita pela API do Actual**: as alterações passam pela interface oficial do
  Actual (a mesma que o servidor de leitura já usa) e sincronizam como qualquer outra
  edição do casal. O servidor escreve com a identidade do Pedro no Actual.
- **Única rede de segurança para apagar**: o backup diário do SQLite da VM para o
  Cloud Storage (`infra/README.md`). Restaurar é grosseiro (volta o dia inteiro).
- **Risco aceito pelo Pedro (2026-10-25)**: com escrita total, sem travas no servidor
  e com a avaliação a cargo da IA, um acesso comprometido ou um texto malicioso bem
  construído podem causar dano que não se desfaz. A mitigação é operacional:
  revogação em minutos (História 2), auditoria de toda escrita (RF-034) e o
  interruptor de escrita (RF-037).
- **Compatibilidade entre fornecedores**: cada fornecedor de IA tem o seu endereço
  de retorno do login e o seu jeito de se registrar; o servidor aceita uma lista
  configurável deles, sem mudar de código (RF-028).
- **Hospedagem é decisão do plano**: nuvem com escala a zero, o Mac do Pedro com
  túnel HTTPS ou outra alternativa. Com 24h (RF-023) e teto de R$ 20/mês (RF-024), depender do Mac ligado não atende; a escolha será avaliada contra a constituição
  (princípios II, V e VIII) e contra os requisitos de segurança acima.
- **Moeda e idioma**: BRL e pt-BR, como na `005`.

---

## Impacto na Constituição

- **Princípio VIII — Privacidade explícita**: é o princípio mais exigido. (a) O
  registro de acesso não pode conter descrição, valor nem identificador de usuário
  — por isso identifica o acesso por **rótulo**, não por e-mail (RF-020). (b) O
  token de sessão do Actual e qualquer segredo vivem só no servidor/cofre (RF-009,
  RF-021). (c) O plano DEVE declarar em `infra/README.md` todo terceiro novo que
  passe a intermediar dados (RF-026). (d) Os dados que chegam ao Claude continuam
  limitados ao que o princípio VIII-a permite (RF-013).
- **Princípio V — Orçamento da VM**: a `e2-micro` tem 384 MB para o container. O
  plano DEVE declarar o impacto de memória e disco e provar que o acesso remoto não
  o estoura (RF-019, RF-025). Um componente sempre disponível fora da VM é aceito, dentro do teto de R$ 20/mês (RF-024).
- **Princípio II — Compatibilidade com upstream**: o plano DEVE manter todo código
  novo em diretório custom (`packages/custom/`) e não editar arquivo do upstream.
- **Princípio VII — Teste para toda lógica custom**: autorização, expiração,
  revogação, lista de autorizadas, freio de tentativas, a ausência de efeito
  colateral nas consultas, o interruptor de escrita e a classificação de risco das
  ferramentas de escrita são lógica de negócio e exigem teste escrito antes. A bateria de CS-004
  deve virar teste automatizado.
- **Princípio IV — IA plugável e barata**: sem chamada a provider por token; o
  Claude continua pela assinatura já paga. Em conformidade.
- **Princípio III — Determinístico antes de IA** _(conflito a resolver por emenda)_:
  a História 4 faz uma IA gravar categoria e apagar dados, e o texto vigente do
  princípio diz que saída de IA "NÃO DEVE gravar categoria sem confirmação do
  usuário ou sem confiança acima de um limiar configurável", e que todo acerto
  confirmado realimenta a camada determinística. O Pedro decidiu (2026-10-25) **emendar
  o princípio III** para permitir que a IA decida com base nas mensagens de risco.
  Consequências para o plano: (a) a emenda é **pré-requisito** da História 4, feita
  por `/speckit.constitution` em PR próprio; (b) o plano NÃO PODE passar o portão da
  constituição para a escrita antes dela; (c) a emenda deve **preservar** a ordem
  "regras nativas e cache antes de IA" e a observabilidade da taxa de acionamento da
  IA, que não foram contestadas; (d) a criação de regra a partir de acertos
  confirmados (cenário 2 da História 4) mantém a realimentação da camada
  determinística. As histórias 1 a 3 não dependem da emenda.
- **Princípio I — Spec antes de código**: este documento. Nenhuma implementação
  começa antes de `/speckit.clarify` e `/speckit.plan`; a História 4 também espera a
  emenda ao princípio III.
- **Princípio VIII — escrita**: o registro de auditoria da escrita (RF-034) e as
  mensagens de risco não podem conter descrição, valor, e-mail ou IP; o texto das
  descrições e valores gravados vai do Claude ao Actual, sem passar por log.
- **Restrições do Produto**: "app nativo publicado em loja" e "sair da free tier
  sem decisão explícita" são vedados — daí o app do Claude como cliente e o teto de custo de R$ 20/mês (RF-024).
