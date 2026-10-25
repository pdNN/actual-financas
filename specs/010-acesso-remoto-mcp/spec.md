# Especificação: Acesso remoto e pelo celular ao assistente financeiro

**Branch**: `010-acesso-remoto-mcp`
**Criada em**: 2026-10-25
**Status**: Rascunho — esclarecimentos respondidos em 2026-10-25; pronta para `/speckit.plan`
**Entrada**: Descrição do usuário: "Quero usar o assistente financeiro (a ponte MCP somente leitura da spec 005) também do celular, configurando um conector no Claude (claude.ai e app), com credenciais fáceis."

---

## Contexto

A spec `005` entregou a **ponte**: o Claude consulta o orçamento do casal, em
linguagem natural, sem alterar nada. Hoje ela só funciona **no Mac do Pedro**,
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
   ("categorize isso para mim"), **Então** o pedido é recusado com a explicação de
   que o assistente só lê, e o orçamento permanece idêntico.
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
   casal, com as mesmas garantias de somente leitura e de mascaramento.
2. **Dado** acessos do Pedro e da Julia ativos, **Quando** encerro só o dela,
   **Então** o do Pedro continua funcionando, e vice-versa.
3. **Dado** a Julia usando o assistente, **Quando** o Pedro consulta o histórico de
   acessos, **Então** consegue distinguir qual acesso (pelo rótulo) fez cada
   consulta.

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
- **Pedido de alteração de dado vindo do celular**: recusado, como no Mac.
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
- **RF-003**: O uso local no Mac (spec `005`) DEVE continuar funcionando como hoje,
  sem alteração de comportamento nem de configuração.

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

**Somente leitura e privacidade**

- **RF-010**: Sistema DEVE ser **somente leitura** pelo acesso remoto: nenhuma
  consulta pode criar, alterar ou apagar transação, categoria, regra, conta ou
  orçamento.
- **RF-011**: Sistema DEVE recusar, com explicação, qualquer pedido de alteração de
  dados vindo do acesso remoto.
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
  de transação, valor, e-mail ou identificador de usuário (princípio VIII).
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
- **CS-007**: Após uma sessão inteira de uso remoto, nenhuma transação, categoria
  ou regra do orçamento foi alterada — verificável comparando o orçamento antes e
  depois.
- **CS-008**: Nenhum segredo existe no repositório, nos logs nem nas respostas —
  verificável por inspeção e por busca automatizada.
- **CS-009**: Nenhuma resposta remota contém CPF, CNPJ, número de cartão ou de
  conta sem máscara, num conjunto de casos de teste com formatos variados.
- **CS-010**: O uso do Actual pelo casal em produção não sofre degradação
  perceptível enquanto o acesso remoto é usado, e o consumo da VM fica dentro do
  limite da constituição.
- **CS-011**: O custo mensal adicional respeita o teto definido pelo Pedro.

---

## Clarificações

### Sessão 2026-10-25

- P: O assistente precisa responder 24h ou aceita só com o Mac ligado? → R: **24h**
  (RF-023).
- P: Qual o teto de custo mensal adicional? → R: **até R$ 20/mês** (RF-024).
- P: A Julia usa já nesta versão? → R: **Sim** (RF-027); a História 3 permanece no
  escopo.

---

## Fora de Escopo

- **Qualquer escrita**: categorizar, criar regra, editar ou apagar transação.
  Segue a spec de escrita que depende de `003`.
- **Mudar o jeito de o casal entrar no Actual** (continua login Google, sem senha
  de servidor) nem trocar a produção para senha.
- **App nativo em loja**: o uso é pelo app do Claude, que já existe; a constituição
  veda app próprio publicado.
- **Outros clientes de IA** além do Claude (ChatGPT, Gemini etc.). Se funcionarem
  pelo mesmo padrão, é bônus, não requisito.
- **Pessoas além do casal**: sem convidados, amigos, contador ou multi-tenant.
- **Novas perguntas, novos dados e novas análises**: o conjunto de perguntas é o
  da `005`. Resumo automático e insights proativos são a `009`.
- **Captura de despesas** (`002`, `006`, `007`) e classificação por IA (`003`, `004`).
- **Acesso público sem autenticação**, mesmo "somente leitura" e mesmo "só por
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
  revogação, lista de autorizadas, freio de tentativas e a garantia de somente
  leitura são lógica de negócio e exigem teste escrito antes. A bateria de CS-004
  deve virar teste automatizado.
- **Princípio IV — IA plugável e barata**: sem chamada a provider por token; o
  Claude continua pela assinatura já paga. Em conformidade.
- **Princípio III — Determinístico antes de IA**: não se aplica; a feature não
  classifica nada.
- **Princípio I — Spec antes de código**: este documento. Nenhuma implementação
  começa antes de `/speckit.clarify` e `/speckit.plan`.
- **Restrições do Produto**: "app nativo publicado em loja" e "sair da free tier
  sem decisão explícita" são vedados — daí o app do Claude como cliente e o teto de custo de R$ 20/mês (RF-024).
