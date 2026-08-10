# Especificação: Desligar por padrão o enriquecimento por IA

**Branch**: `001-desligar-padrao-enriquecimento`
**Criada em**: 2026-08-10
**Status**: Rascunho
**Entrada**: Descrição do usuário: "Desligar por padrão o enriquecimento de transações por IA, mantendo o código para reconstrução futura"

---

## Contexto

Hoje existe uma classificação de transações por IA que aparece no fluxo de
importação: ao importar um arquivo, é possível pedir que um modelo sugira
categoria para as transações do lote.

Ela foi construída antes de existir spec e antes da constituição, e por isso não
segue as regras que hoje valem para o projeto:

- **não tenta a camada determinística primeiro** — vai direto ao modelo, mesmo
  para descrições que as regras nativas do Actual já resolveriam (princípio III);
- **não aprende** — o mesmo estabelecimento volta ao modelo em todo import;
- **o provider é fixo no código**, sem possibilidade de troca por configuração
  (princípio IV);
- **não tem teste** (princípio VII).

A feature `003` do backlog vai reconstruir isso do jeito certo. Até lá, o que
existe deveria estar **desligado por padrão** — não porque faz mal, mas porque
gasta chamada de modelo para entregar um resultado pior do que a versão que
virá, e porque uma feature ligada por acidente é uma feature que ninguém decidiu
ligar.

O código **fica**. Ele é o ponto de partida da `003`.

---

## Cenários de Usuário e Testes

### História 1 — Nada de IA acontece sem alguém ter ligado (Prioridade: P1) 🎯 MVP

Como quem opera o sistema, quero ter certeza de que nenhuma chamada a modelo de
IA acontece a menos que eu tenha ligado explicitamente essa função, para que não
haja custo nem envio de dados que eu não decidi.

**Por que essa prioridade**: é o objetivo inteiro da mudança. As outras
histórias só existem para que esta não crie efeitos colaterais ruins.

**Teste independente**: numa instalação sem nenhuma configuração especial,
importar um arquivo e verificar que a opção de classificar por IA não é
oferecida e que nenhuma requisição a modelo é feita.

**Cenários de aceitação**:

1. **Dado** um sistema recém-instalado, sem configuração de IA, **Quando** eu
   abro o fluxo de importação, **Então** a opção de classificação por IA não
   aparece.
2. **Dado** um sistema onde a função de IA não está ligada, **Quando** algo
   tenta acionar a classificação assim mesmo, **Então** a operação é recusada e
   nenhuma chamada a modelo externo acontece.
3. **Dado** um sistema onde apenas a credencial do provider está presente, mas a
   função não foi ligada, **Quando** eu abro a importação, **Então** a opção
   continua não aparecendo.

O cenário 3 é o que diferencia esta mudança do comportamento atual: hoje, a mera
presença da credencial já liga a funcionalidade. Passa a ser preciso ligar de
propósito.

---

### História 2 — Consigo religar quando quiser (Prioridade: P2)

Como quem opera o sistema, quero conseguir ligar a classificação por IA de novo
sem alterar código, para poder comparar o comportamento atual com o da versão
reconstruída, ou usar pontualmente.

**Por que essa prioridade**: sem isso, "desligar" viraria "remover na prática", e
o código mantido não teria como ser exercitado. É o que garante que a decisão é
reversível.

**Teste independente**: ligar a função por configuração, reiniciar, importar um
arquivo e verificar que a opção volta a aparecer e funciona como antes.

**Cenários de aceitação**:

1. **Dado** que liguei a função e configurei a credencial, **Quando** abro a
   importação, **Então** a opção de classificação por IA aparece e funciona como
   funcionava antes desta mudança.
2. **Dado** que liguei a função mas **não** configurei credencial, **Quando**
   abro a importação, **Então** o sistema informa que falta configuração, em vez
   de falhar de forma obscura.

---

### História 3 — Fica registrado que isto é temporário (Prioridade: P3)

Como quem vai retomar este assunto daqui a algumas semanas, quero encontrar
escrito por que a função está desligada e o que vai substituí-la, para não
perder tempo redescobrindo a decisão nem religá-la por engano.

**Por que essa prioridade**: é a história de menor valor imediato e a única cuja
ausência não quebra nada — mas é o que evita que o código mantido vire código
morto sem explicação.

**Teste independente**: alguém que não participou desta decisão consegue
descobrir, a partir da documentação do projeto, por que a função está desligada e
qual feature vai substituí-la.

**Cenários de aceitação**:

1. **Dado** que estou lendo a documentação do projeto, **Quando** procuro por
   classificação por IA, **Então** encontro que ela está desligada por padrão, o
   motivo, e a referência à feature que vai reconstruí-la.

---

### Casos de Borda

- A função está desligada, mas a credencial do provider continua cadastrada no
  cofre de segredos — não pode ligar nada sozinha.
- Alguém liga a função e esquece a credencial: precisa de mensagem clara, não de
  erro genérico.
- A função é desligada enquanto alguém está com a tela de importação aberta: a
  próxima tentativa precisa ser recusada, não executada com o estado antigo.
- Um cliente antigo, que ainda mostra o botão, chama a classificação num servidor
  onde a função está desligada — a recusa tem que vir do servidor, não depender
  da tela ter escondido o botão.

---

## Requisitos

### Requisitos Funcionais

- **RF-001**: Sistema DEVE manter a classificação de transações por IA desligada
  por padrão, sem exigir nenhuma ação de quem instala.
- **RF-002**: Sistema NÃO DEVE realizar chamada a provider externo de IA enquanto
  a função estiver desligada, independentemente de haver credencial configurada.
- **RF-003**: Sistema DEVE permitir ligar a função por configuração, sem
  alteração de código e sem novo build.
- **RF-004**: Sistema DEVE recusar, no servidor, qualquer pedido de classificação
  recebido enquanto a função estiver desligada — a recusa NÃO DEVE depender de a
  interface ter escondido a opção.
- **RF-005**: Sistema DEVE ocultar a opção de classificação por IA na interface
  enquanto a função estiver desligada.
- **RF-006**: Sistema DEVE distinguir, para quem liga a função, entre "função
  desligada" e "função ligada mas sem credencial", com mensagem específica para
  cada caso.
- **RF-007**: Sistema DEVE preservar o comportamento atual da classificação
  quando a função estiver ligada e credenciada.
- **RF-008**: A documentação do projeto DEVE registrar que a função está
  desligada por padrão, o motivo, e qual feature vai substituí-la.

### Entidades-Chave

Esta feature não introduz nem altera entidades de dados. Ela muda apenas a
condição sob a qual uma funcionalidade existente é oferecida e executada.

---

## Critérios de Sucesso

- **CS-001**: Numa instalação nova, sem configuração adicional, o número de
  chamadas a provider externo de IA ao importar um arquivo é zero.
- **CS-002**: Ligar a função e voltar a usá-la leva menos de 5 minutos e não
  exige alterar código nem refazer build.
- **CS-003**: Com a função desligada, nenhuma tentativa de classificação é
  executada, mesmo quando o pedido chega direto ao servidor, sem passar pela
  interface.
- **CS-004**: Alguém que não participou desta decisão consegue explicar, só lendo
  a documentação do projeto, por que a função está desligada e o que vai
  substituí-la.

---

## Fora de Escopo

- Remover o código da classificação por IA. Ele fica, e é a base da feature `003`.
- Melhorar a qualidade da classificação, adicionar few-shot do histórico, cache
  ou aprendizado — tudo isso é `002` e `003`.
- Tornar o provider de IA plugável. É `003`.
- Remover a credencial do cofre de segredos. É operação, não código, e está
  descrita no runbook.
- Qualquer mudança no motor de regras nativo do Actual.

---

## Premissas

- Desligar por padrão é preferível a remover, porque a feature `003` vai partir
  deste código; remover agora significaria reescrever do zero depois.
- Ninguém depende hoje da classificação por IA em produção: o sistema ainda não
  está em uso real, e as despesas sequer foram cadastradas (ver
  `specs/000-produto/spec.md`).
- "Ligar por configuração" segue o padrão que o projeto já usa para configuração
  de servidor, sem inventar mecanismo novo.
- Como não há usuários ativos da função, não é necessário aviso de depreciação
  nem período de transição.

---

## Impacto na Constituição

- **Princípio III — determinístico antes de IA**: esta feature é um passo em
  direção ao princípio, não uma violação. Ela não torna a classificação
  determinística; ela impede que a versão que ignora a camada determinística rode
  sem alguém ter decidido isso.
- **Princípio IV — IA plugável e barata**: o provider continua fixo no código
  enquanto a função existir desligada. A violação **permanece**, mas deixa de ter
  efeito prático, e sua correção é a feature `003`. Isso DEVE ser registrado na
  tabela de Rastreamento de Complexidade do plano.
- **Princípio VII — teste para lógica custom**: o comportamento novo (recusar
  quando desligado, oferecer quando ligado) precisa de teste. A ausência de teste
  no código existente não é resolvida aqui.
- **Princípio VIII — privacidade explícita**: reforçado. Com a função desligada
  por padrão, nenhum dado de transação sai da máquina sem decisão consciente.
