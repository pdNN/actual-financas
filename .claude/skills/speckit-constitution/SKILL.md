---
name: speckit-constitution
description: Cria ou emenda a constituição do projeto em .specify/memory/constitution.md, com versionamento semântico e relatório de impacto. Use ao invocar /speckit.constitution ou quando o usuário quiser mudar as regras/princípios do projeto.
argument-hint: "Descreva o princípio ou regra a adicionar/alterar"
user-invocable: true
---

# /speckit.constitution — Criar ou emendar a constituição

Entrada do usuário: `$ARGUMENTS`

## Guarda de escopo

**Se a entrada pedir implementação de feature, geração de código, refatoração,
build ou deploy, você NÃO DEVE executar isso aqui.** Extraia essas intenções,
registre-as numa seção "Próximas ações" ao final da sua resposta e siga apenas
com a mudança na constituição.

## Passos

### 1. Leia o estado atual

Leia `.specify/memory/constitution.md`. Se não existir, use
`.specify/templates/constitution-template.md` como base.

**Nunca crie um template novo.** Sempre sobrescreva o arquivo de memória existente.

### 2. Aplique a emenda

Escreva em **português (pt-BR)**. Cada princípio DEVE ser:

- **declarativo** — diz o que é verdade no projeto;
- **testável** — dá para apontar objetivamente se foi violado;
- **imperativo** — use **DEVE** / **NÃO DEVE**. Evite "deveria", "idealmente",
  "sempre que possível". Se precisar de nuance, escreva a exceção explicitamente.

Numeração romana (I, II, III…). Princípio não-negociável leva o rótulo
`(NÃO NEGOCIÁVEL)` no título.

### 3. Versione

Versionamento semântico da própria constituição:

- **MAIOR** — remoção ou redefinição incompatível de princípio;
- **MENOR** — novo princípio, ou ampliação material de orientação;
- **CORREÇÃO** — esclarecimento de texto sem mudar significado.

Atualize o rodapé: `**Versão** | **Ratificada em** | **Última emenda**`.
Datas no formato ISO `AAAA-MM-DD`.

### 4. Relatório de Impacto de Sincronização

Escreva no topo do arquivo, como comentário HTML:

```html
<!--
Relatório de Impacto de Sincronização
- Versão: 1.0.0 → 1.1.0
- Princípios modificados: [lista, renomeações como "antigo → novo"]
- Seções adicionadas: [lista]
- Seções removidas: [lista]
- Pendências: [TODO(CAMPO): explicação]
-->
```

### 5. Valide

- Nenhum token entre colchetes sem preenchimento sobrando.
- Datas em ISO.
- Informação faltante vira `TODO(<CAMPO>): explicação` — nunca um chute.

### 6. Propague

Se a emenda muda algo que outros arquivos afirmam, atualize-os na mesma mudança:

- `CLAUDE.md` — resumo operacional das regras;
- `AGENTS.md` — guia para outros agentes;
- `.specify/templates/plan-template.md` — itens da Verificação da Constituição.

### 7. Relate

Diga a versão nova, o que mudou e quais arquivos foram propagados.
