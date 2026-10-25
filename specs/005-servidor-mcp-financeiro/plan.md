# Plano de Implementação: Servidor MCP financeiro (somente leitura)

**Branch**: `005-servidor-mcp-financeiro`
**Data**: 2026-10-18
**Spec**: `specs/005-servidor-mcp-financeiro/spec.md`

---

## Resumo

> **Emenda 2026-10-19:** o MCP pronto não autentica na produção (login Google, sem senha). Ver "Emenda D-1" em `research.md`: o servidor passa a ser **próprio e mínimo**, com token de sessão. O restante deste plano (lançador, máscara, guarda, subagente) continua valendo; onde diz `actual-mcp-server`, leia "nosso servidor".

**Adotar, não construir.** O servidor MCP de código aberto
[`actual-mcp-server`](https://github.com/agigante80/actual-mcp-server)
(MIT, v0.22.46, publicado no npm) já cobre a maior parte das leituras da spec.
Ele roda na máquina do Pedro em modo `--stdio`, com `MCP_READ_ONLY=true` e
versão fixada. Em volta dele, este repositório adiciona **três peças pequenas,
todas fora de arquivos do upstream**:

1. um **lançador** que monta a configuração segura (leitura apenas, versão
   fixada, senha vinda do chaveiro do macOS, nunca de arquivo);
2. uma **máscara de dados sensíveis** que limpa as respostas antes de o Claude
   vê-las (a constituição proíbe número de conta e de cartão chegarem ao
   provider de IA, e o servidor só redige o _log_, não a _resposta_);
3. um **subagente `assistente-financeiro`** que carrega as definições de negócio
   (sobra = receita menos despesa, transferência não é despesa, checar
   completude antes de responder) e o protocolo de resposta.

Nenhum código novo roda na VM. Se o subagente se mostrar impreciso nas lacunas
(completude e duplicatas), o escalonamento é um MCP complementar em outra spec,
não nesta.

---

## Contexto Técnico

| Item                        | Valor                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Linguagem / versão**      | TypeScript, Node >= 22 (lançador e máscara); servidor externo em Node >= 22                                                                        |
| **Dependências principais** | `actual-mcp-server@0.22.46` (via `npx`, **não** entra no `package.json`); nenhuma dependência nova no monorepo                                     |
| **Armazenamento**           | Nenhum novo. Lê o orçamento do Actual; o servidor mantém uma cópia local do orçamento em disco, na máquina do Pedro                                |
| **Testes**                  | Vitest ao lado do fonte (`launch.test.ts`, `mask-pii.test.ts`); verificação manual guiada no `quickstart.md`                                       |
| **Plataforma alvo**         | Máquina do Pedro (macOS), Claude Code. Nada na VM                                                                                                  |
| **Tipo de projeto**         | Pacote custom no monorepo + arquivos `.claude/` novos                                                                                              |
| **Metas de performance**    | Primeira pergunta em < 30 s (CS-001), incluindo a abertura da sessão; demais, segundos                                                             |
| **Restrições**              | Zero escrita (RF-010); sem credencial em arquivo (RF-013); sem alterar a instalação de produção (RF-017)                                           |
| **Escala / escopo**         | 2 usuários, centenas de transações por mês; uso por 1 pessoa                                                                                       |
| **Pacotes tocados**         | **Novo**: `packages/custom/` (workspace) com `mcp-financeiro/`. **Novos** em `.claude/`: `agents/assistente-financeiro.md`. **Nenhum** do upstream |

### Impacto de memória e disco

- **VM (`e2-micro`, 384 MB)**: nenhum processo novo. O cliente faz **um** login e
  **um** download do orçamento por sessão do Claude Code (o servidor mantém a
  conexão e a reutiliza). O custo é o do download do arquivo do orçamento
  (centenas de transações: ordem de kilobytes a poucos MB). Medição obrigatória
  no `quickstart.md` (passo 6) antes de declarar RF-017 cumprido.
- **Máquina do Pedro**: processo Node do servidor (dezenas a ~150 MB residentes
  enquanto a sessão durar) e uma cópia do orçamento em disco, em diretório
  fora do repositório.

---

## Verificação da Constituição

- [x] **I — Especificação antes de código**: `spec.md` existe e não tem marcadores pendentes.
- [x] **II — Compatibilidade com upstream**: todo código novo em `packages/custom/mcp-financeiro/` e `.claude/agents/`. **Nenhum arquivo do upstream é editado.** Em particular, **não** se toca `.claude/settings.json` (do upstream): os _hooks_ vão no cabeçalho do subagente. `package.json` da raiz não muda (o workspace `packages/*` já cobre o pacote novo); o pacote tem o seu. Única exceção, inevitável e aditiva: `yarn.lock` ganha a entrada do workspace novo (tarefas T003 e T039).
- [x] **III — Determinístico antes de IA**: esta versão não classifica nem grava. Os números (totais, transferências, saldos) vêm de ferramentas determinísticas do servidor; o Claude só os apresenta e interpreta. A máscara de PII também é determinística (expressões regulares, não modelo).
- [x] **IV — IA plugável e barata**: custo adicional zero, pela assinatura Claude Code (rota preferida pelo princípio). Não há chamada a provider por token.
- [x] **V — Orçamento da VM**: nada roda na VM; impacto do download medido no passo 6 do quickstart. Trabalho pesado é local.
- [x] **VI — pt-BR e BRL**: o protocolo do subagente exige respostas em pt-BR e valores em reais. Não há UI no front-end.
- [x] **VII — Teste para toda lógica custom**: lançador e máscara têm teste escrito antes. O _prompt_ do subagente não é lógica executável; é coberto pela verificação guiada do `quickstart.md`.
- [x] **VIII — Privacidade explícita**: ver "Privacidade" abaixo. A declaração em `infra/README.md` fica para uma tarefa isolada, de propósito (outra sessão está editando esse arquivo).

**Resultado da 1ª avaliação (pré-Fase 0)**: PASSOU, com uma pendência registrada: o item VIII exige a máscara de PII (Fase 0, decisão D-3) porque o servidor externo **não** redige as respostas.
**Resultado da 2ª avaliação (pós-Fase 1)**: PASSOU — ver fim do documento.

### Privacidade (princípio VIII)

| Dado                                                                        | Pode ir ao Claude? | Como é garantido                                                                                                  |
| --------------------------------------------------------------------------- | :----------------: | ----------------------------------------------------------------------------------------------------------------- |
| Descrição, valor, data, categoria, payee                                    |        Sim         | Fluxo normal                                                                                                      |
| Nome amigável da conta                                                      |        Sim         | Fluxo normal                                                                                                      |
| Número de conta/cartão, CNPJ em texto de transação (CPF pode, const. 1.2.0) |      **Não**       | `mask-pii` na resposta (PostToolUse do subagente). Teste cobre formatos com e sem pontuação                       |
| Senha do Actual, senha de criptografia do orçamento                         |      **Não**       | Só no chaveiro do macOS; o lançador injeta no ambiente do processo filho; nunca em arquivo, argumento nem log     |
| Identificadores de sessão do servidor                                       |      **Não**       | Não são devolvidos pelas ferramentas de leitura usadas (verificar no quickstart, passo 5)                         |
| Log do servidor                                                             |       Local        | O servidor redige segredos no log (#220). RF-014: verificado no quickstart, passo 5, procurando descrição e valor |

---

## Estrutura do Projeto

### Documentação desta feature

```
specs/005-servidor-mcp-financeiro/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1 (sem migração)
├── quickstart.md        # Fase 1
├── contracts/
│   ├── tool-surface.md  # quais ferramentas, quais recusas
│   └── answer-protocol.md  # contrato de resposta do subagente
├── tasks.md             # /speckit.tasks
└── checklists/
    └── requirements.md
```

### Código-fonte

```
packages/custom/
├── package.json             # pacote de workspace (raiz é packages/*, um nível); só devDependencies de teste
├── tsconfig.json
└── mcp-financeiro/
    ├── src/
    │   ├── tool-surface.ts      # lista fechada de ferramentas + decisão do PreToolUse
    │   ├── launch.ts            # monta comando/ambiente do servidor (puro, testável)
    │   ├── mask-pii.ts          # mascara CNPJ/conta/cartão em texto (puro; CPF passa, const. 1.2.0)
    │   ├── hook-mask.ts / hook-guard.ts   # adaptadores de stdin/stdout dos hooks
    │   └── *.test.ts            # um teste por arquivo acima, mais agent-config.test.ts
    └── bin/                     # pontos de entrada finos (chaveiro + hooks)

.claude/agents/assistente-financeiro.md    # subagente: protocolo, definições e hooks
```

**Decisão de estrutura**: tudo em `packages/custom/` e `.claude/agents/` (arquivos
novos), por causa do princípio II. O subagente declara o servidor MCP e os
_hooks_ no próprio cabeçalho, de modo que as ferramentas financeiras só existem
dentro dele e o resto do repositório não herda configuração nova.

---

## Fase 0 — Pesquisa → `research.md`

Feita. Decisões D-1 a D-7 em `research.md`. Nenhum `NECESSITA ESCLARECIMENTO`
restante; duas verificações práticas (S-1, S-2) ficam como _spikes_ no início de
`/speckit.tasks`, porque dependem de rodar Claude Code de verdade.

## Fase 1 — Design

- `data-model.md`: sem migração; mapeia entidades da spec para as ferramentas.
- `contracts/tool-surface.md`: lista fechada de ferramentas publicadas.
- `contracts/answer-protocol.md`: o que toda resposta de análise deve conter.
- `quickstart.md`: do zero à primeira pergunta, e a bateria de verificação.

### Reavaliação da Constituição (pós-Fase 1)

- **II**: continua sem arquivo do upstream editado (verificado: nada fora de `packages/custom/` e `.claude/agents/`).
- **V**: o design não introduziu processo na VM.
- **VII**: o design adicionou o adaptador `hook-mask.ts`; é fino (JSON in/out) e coberto por teste de contrato dentro de `mask-pii.test.ts`.
- **VIII**: a máscara fecha a lacuna identificada. **Risco residual**, aceito e registrado: nomes de pessoas em descrições de Pix (ex.: "PIX ENVIADO MARIA S") não são mascarados, pois são payee e a constituição os permite.

**Resultado**: PASSOU, sem violações; a tabela abaixo fica vazia.

---

## Rastreamento de Complexidade

| Violação    | Por que é necessária | Por que a alternativa mais simples foi rejeitada |
| ----------- | -------------------- | ------------------------------------------------ |
| _(nenhuma)_ |                      |                                                  |
