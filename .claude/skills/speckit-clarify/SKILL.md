---
name: speckit-clarify
description: Faz até 5 perguntas dirigidas para eliminar ambiguidades da especificação ativa e registra as respostas nela. Segundo passo do fluxo SDD do actual-financas. Use após /speckit.specify, quando houver marcadores [NECESSITA ESCLARECIMENTO], ou ao invocar /speckit.clarify.
argument-hint: "(opcional) área específica a esclarecer"
user-invocable: true
---

# /speckit.clarify — Esclarecer a especificação

Entrada opcional do usuário: `$ARGUMENTS`

## Objetivo

Eliminar ambiguidade da spec **antes** de planejar, uma pergunta por vez.

## Passos

### 1. Resolva os caminhos

```bash
.specify/scripts/bash/check-prerequisites.sh --json --paths-only
```

Leia `FEATURE_SPEC` e `.specify/memory/constitution.md`.

### 2. Levante as ambiguidades

Varra a spec procurando:

- marcadores `[NECESSITA ESCLARECIMENTO]` explícitos;
- requisitos que não dá para transformar em teste;
- critérios de sucesso sem número;
- histórias sem cenário de aceitação;
- casos de borda não tratados;
- conflito com algum princípio da constituição.

Priorize: escopo > privacidade/segurança > experiência > detalhe técnico.

### 3. Pergunte — no máximo 5, **uma de cada vez**

Para cada pergunta:

- ofereça de 2 a 4 opções concretas, com o trade-off de cada uma;
- diga qual você recomenda e por quê;
- **espere a resposta** antes da próxima pergunta.

Use a ferramenta AskUserQuestion quando as opções forem discretas.

NÃO pergunte o que você consegue assumir com bom senso. Cada pergunta gasta a
paciência do usuário — use só nas que realmente mudam o que será construído.

### 4. Registre as respostas na spec

Após cada resposta, atualize `FEATURE_SPEC` imediatamente:

- atualize o requisito, história ou critério afetado;
- remova o marcador `[NECESSITA ESCLARECIMENTO]` correspondente;
- registre a decisão em uma seção `## Esclarecimentos`, com subseção
  `### Sessão AAAA-MM-DD`, no formato `**P**: pergunta / **R**: resposta`.

### 5. Revalide

Reavalie `FEATURE_DIR/checklists/requirements.md` e marque o que agora passa.

### 6. Relate

Resuma o que mudou e o que ainda está aberto. Sugira `/speckit.plan`.
