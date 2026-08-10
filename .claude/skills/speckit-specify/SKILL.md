---
name: speckit-specify
description: Cria ou atualiza a especificação de uma feature a partir de uma descrição em linguagem natural. Primeiro passo do fluxo SDD do actual-financas. Use quando o usuário pedir uma feature nova, disser "quero implementar X", "nova demanda", ou invocar /speckit.specify.
argument-hint: 'Descreva a feature que você quer especificar'
user-invocable: true
---

# /speckit.specify — Criar a especificação

Entrada do usuário: `$ARGUMENTS`

## Objetivo

Transformar uma descrição solta em uma especificação **testável, sem detalhe de
implementação**, em `specs/NNN-slug/spec.md`.

## Passos

### 1. Carregue o contexto

Leia `.specify/memory/constitution.md`. Ela restringe o que pode ser
especificado (fork, e2-micro, custo de IA, privacidade, pt-BR/BRL).

### 2. Crie a feature

```bash
.specify/scripts/bash/create-new-feature.sh --json "$ARGUMENTS"
```

O script devolve JSON com `BRANCH_NAME`, `SPEC_FILE`, `FEATURE_DIR`. Ele já:
cria `specs/NNN-slug/`, copia o `spec-template.md`, grava `.specify/feature.json`
e faz checkout da branch `NNN-slug`.

Use **exatamente** os caminhos devolvidos. Não invente nome de diretório.

### 3. Escreva a spec

Preencha `SPEC_FILE` seguindo o template. Em **português (pt-BR)**.

**Diretrizes:**

- Foque no **QUE** o usuário precisa e no **PORQUÊ**.
- **Evite o COMO**: nada de stack, biblioteca, nome de API, estrutura de arquivo,
  schema de banco. Isso é papel do `/speckit.plan`.
- Escreva para ser lido por quem não programa.
- NÃO crie checklists dentro da spec — isso é o `/speckit.checklist`.

**Histórias de usuário:**

- Priorize como jornadas (P1, P2, P3), ordenadas por importância.
- Cada história DEVE ser **independentemente testável**: implementar só a P1
  precisa deixar um MVP que já entrega valor.
- Cada história leva "Por que essa prioridade", "Teste independente" e
  cenários **Dado / Quando / Então**.

**Requisitos funcionais:**

- Formato `RF-001: Sistema DEVE …`.
- Cada requisito precisa virar teste. Se não vira, ainda está vago.

**Critérios de sucesso:**

- Mensuráveis e **agnósticos de tecnologia**.
- Bom: "Registrar uma despesa no celular leva menos de 15 segundos".
- Ruim: "A resposta da API leva menos de 200ms" (técnico demais).

### 4. Orçamento de esclarecimentos

**No máximo 3 marcadores `[NECESSITA ESCLARECIMENTO: pergunta]`.**

Use só para decisões que:

- mudam bastante o escopo ou a experiência;
- têm mais de uma leitura razoável com implicações diferentes;
- não têm um padrão razoável.

Prioridade: escopo > privacidade/segurança > experiência > detalhe técnico.

**Faça suposições informadas** para o resto e registre em "Premissas".
NÃO pergunte sobre: retenção de dados, metas de performance, tratamento de erro,
método de autenticação, padrão de integração — assuma o padrão do projeto.

### 5. Gere o checklist de qualidade

Crie `FEATURE_DIR/checklists/requirements.md` com exatamente este conteúdo:

```markdown
# Checklist de Qualidade da Especificação: [NOME DA FEATURE]

**Propósito**: validar completude e qualidade da spec antes de planejar.

## Qualidade do Conteúdo

- [ ] Sem detalhes de implementação (linguagens, frameworks, APIs)
- [ ] Focada em valor para o usuário e necessidade de negócio
- [ ] Escrita para quem não é técnico
- [ ] Todas as seções obrigatórias preenchidas

## Completude dos Requisitos

- [ ] Nenhum marcador [NECESSITA ESCLARECIMENTO] pendente
- [ ] Requisitos são testáveis e não-ambíguos
- [ ] Critérios de sucesso são mensuráveis
- [ ] Critérios de sucesso são agnósticos de tecnologia
- [ ] Todos os cenários de aceitação estão definidos
- [ ] Casos de borda identificados
- [ ] Escopo claramente delimitado
- [ ] Dependências e premissas identificadas

## Prontidão da Feature

- [ ] Todo requisito funcional tem critério de aceitação claro
- [ ] As histórias cobrem os fluxos principais
- [ ] A feature atende aos critérios de sucesso definidos
- [ ] Nenhum detalhe de implementação vazou para a especificação

## Conformidade com a Constituição

- [ ] A feature respeita os princípios de .specify/memory/constitution.md
- [ ] Violações necessárias estão sinalizadas para justificar no plano
```

### 6. Valide a si mesmo

Avalie a spec contra o checklist e corrija. **No máximo 3 iterações.**
Se depois disso algo continuar falhando, apresente ao usuário o que falta e
por que você não conseguiu resolver sozinho.

### 7. Relate

Informe: caminho da spec, branch criada, as histórias com suas prioridades, e
qualquer `[NECESSITA ESCLARECIMENTO]` remanescente.

Sugira o próximo passo: `/speckit.clarify` se houver marcadores pendentes,
`/speckit.plan` caso contrário.
