# Especificação: [NOME DA FEATURE]

**Branch**: `[NNN-nome-da-feature]`
**Criada em**: [DATA]
**Status**: Rascunho
**Entrada**: Descrição do usuário: "$ARGUMENTS"

---

## Cenários de Usuário e Testes _(obrigatório)_

<!--
  IMPORTANTE: as histórias devem ser PRIORIZADAS como jornadas de usuário
  ordenadas por importância. Cada história precisa ser INDEPENDENTEMENTE
  TESTÁVEL — se você implementar SÓ UMA delas, ainda tem que sobrar um MVP
  que entrega valor de verdade.

  Cada história deve poder ser: desenvolvida / testada / entregue / demonstrada
  de forma independente.
-->

### História 1 — [Título curto] (Prioridade: P1)

[Descreva a jornada em linguagem simples, do ponto de vista de quem usa.]

**Por que essa prioridade**: [o valor que ela entrega e por que vem primeiro]

**Teste independente**: [como dá para testar essa história sozinha, sem as outras]

**Cenários de aceitação**:

1. **Dado** [estado inicial], **Quando** [ação], **Então** [resultado observável]
2. **Dado** [estado inicial], **Quando** [ação], **Então** [resultado observável]

---

### História 2 — [Título curto] (Prioridade: P2)

[…]

**Por que essa prioridade**: […]

**Teste independente**: […]

**Cenários de aceitação**:

1. **Dado** […], **Quando** […], **Então** […]

---

### História 3 — [Título curto] (Prioridade: P3)

[…]

---

### Casos de Borda

- O que acontece quando [condição limite]?
- Como o sistema lida com [entrada inválida / dado ausente / falha externa]?

---

## Requisitos _(obrigatório)_

### Requisitos Funcionais

<!--
  Escreva no formato "Sistema DEVE …". Cada requisito precisa ser
  testável e não-ambíguo. Se um requisito não dá para virar teste,
  ele ainda não está pronto.
-->

- **RF-001**: Sistema DEVE [capacidade específica, ex.: "permitir importar um extrato OFX"]
- **RF-002**: Sistema DEVE [capacidade específica]
- **RF-003**: Sistema NÃO DEVE [restrição explícita, quando relevante]

_Exemplo de requisito com incerteza marcada:_

- **RF-00X**: Sistema DEVE notificar o usuário via [NECESSITA ESCLARECIMENTO: canal não definido — push, e-mail, só na tela?]

> **Orçamento de esclarecimentos: no máximo 3 marcadores `[NECESSITA ESCLARECIMENTO]`.**
> Use só para decisões críticas que (a) mudam bastante o escopo ou a experiência,
> (b) têm mais de uma leitura razoável com implicações diferentes, ou
> (c) não têm um padrão razoável.
> Prioridade: escopo > privacidade/segurança > experiência > detalhe técnico.
> Para todo o resto, **faça suposições informadas** e registre-as em "Premissas".
> Não pergunte sobre: retenção de dados, metas de performance, tratamento de erro,
> método de autenticação ou padrão de integração — assuma o padrão do projeto.

### Entidades-Chave _(incluir se a feature envolve dados)_

- **[Entidade]**: o que representa, atributos relevantes, como se relaciona com as demais.

---

## Critérios de Sucesso _(obrigatório)_

<!--
  AÇÃO NECESSÁRIA: defina critérios mensuráveis. Eles precisam ser
  agnósticos de tecnologia — descrevem o que o usuário percebe, não como
  o código é feito.

  Bom:  "Registrar uma despesa avulsa leva menos de 15 segundos no celular"
  Bom:  "95% das transações do mês saem categorizadas sem intervenção manual"
  Ruim: "A resposta da API leva menos de 200ms"     (técnico demais)
  Ruim: "Os componentes React renderizam eficientemente"  (específico de framework)
-->

- **CS-001**: [resultado mensurável]
- **CS-002**: [resultado mensurável]

---

## Fora de Escopo

- [o que esta feature explicitamente NÃO faz]

---

## Premissas

- [suposição assumida na ausência de informação, e por quê]

---

## Impacto na Constituição

<!-- Preencha se a feature encosta em algum princípio de .specify/memory/constitution.md -->

- **Princípio [N] — [nome]**: [como esta feature se relaciona com ele]
