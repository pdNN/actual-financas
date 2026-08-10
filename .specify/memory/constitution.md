<!--
Relatório de Impacto de Sincronização
- Versão: (inexistente) → 1.0.0
- Ratificação inicial da constituição do actual-financas.
- Princípios adicionados: I a VIII.
- Seções adicionadas: Restrições do Produto, Fluxo de Desenvolvimento, Governança.
- Origem: consolida e substitui .cursor/rules/instructions.mdc,
  .github/copilot-instructions.md e .windsurf/rules/instructions.md, removidos
  nesta mesma mudança.
- Pendências: nenhuma.
-->

# Constituição — actual-financas

Este documento é a autoridade máxima do projeto. Toda especificação, plano,
lista de tarefas e revisão de código é avaliada contra ele. **Conflito com a
constituição é sempre um achado CRÍTICO**: corrige-se a spec, o plano ou as
tarefas — nunca se dilui, reinterpreta ou ignora silenciosamente um princípio.

## Identidade

| Chave | Valor |
|---|---|
| **O que é** | Sistema de finanças pessoais do Pedro e da Julia (casal) |
| **Base** | Fork de [actualbudget/actual](https://github.com/actualbudget/actual), a partir da v26.3.0 |
| **Licença** | MIT (herdada do upstream) |
| **Moeda / locale** | BRL, pt-BR |
| **Stack** | Monorepo TypeScript (Yarn 4 workspaces), React 19, Express, SQLite |
| **Hospedagem** | GCP Compute Engine `e2-micro` (free tier), projeto `actual-financas`, SQLite local, Caddy com TLS automático |

**O problema que este sistema existe para resolver**: as receitas do casal foram
cadastradas, mas as despesas nunca. O gargalo é o **atrito de registro**, não a
falta de funcionalidade — o Actual Budget já faz orçamento de envelope muito bem.
Toda feature deve ser julgada primeiro por quanto ela reduz esse atrito.

---

## Princípios Fundamentais

### I. Especificação antes de código (NÃO NEGOCIÁVEL)

Nenhuma mudança de comportamento entra no repositório sem uma especificação
aprovada em `specs/NNN-slug/spec.md`.

O fluxo é o do [spec-kit](https://github.com/github/spec-kit):
`/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` →
`/speckit.implement`.

A spec é a fonte de verdade da demanda. Se o código diverge da spec, **a spec
está certa e o código está errado** — corrija o código, ou emende a spec
explicitamente antes de continuar.

**Exceções que PODEM ir direto ao código**, sem spec:

1. Correção de texto, comentário ou erro de digitação, sem mudança de comportamento.
2. Atualização de dependência que não muda comportamento observável.
3. Merge de upstream (`actualbudget/actual`) e resolução dos conflitos dele.
4. Mudanças restritas a `infra/` (Terraform, Caddy, workflows de deploy, scripts de backup).
5. Correção de bug em produção. **Neste caso a spec é obrigatória em retrospecto**:
   registre `specs/NNN-slug/spec.md` no formato de bug (o que quebrou, como
   reproduzir, teste de regressão) antes do merge seguinte.

Qualquer coisa fora dessa lista exige spec. Na dúvida, exige spec.

### II. Compatibilidade com upstream acima de conveniência

Este repositório é um fork vivo de `actualbudget/actual` e puxa atualizações do
upstream com regularidade. **Quebrar o merge de upstream é falha crítica.**

- Código novo DEVE viver em diretório custom: `packages/custom/`,
  `packages/loot-core/src/custom/`, `packages/desktop-client/src/components/custom/`,
  `packages/sync-server/src/custom/`.
- Editar um arquivo do upstream é o último recurso. Quando inevitável, a mudança
  DEVE ser cercada pelos marcadores já usados no repositório:

  ```ts
  // >>> CUSTOM: actual-financas — [descrição curta]
  // ... código ...
  // <<< CUSTOM
  ```

  E DEVE ser listada na seção "Verificação da Constituição" do plano.
- NÃO DEVE deletar, renomear ou reestruturar arquivos do upstream.
- Em `package.json`, apenas **adicionar** dependências. Nunca remover nem alterar
  as existentes.
- O `AGENTS.md` e o `CLAUDE.md` são exceções assumidas: pertencem ao fork e vão
  conflitar em merges. A resolução é sempre "manter a versão do fork".

### III. Determinístico antes de IA

A IA é a última camada, não a primeira.

Toda classificação de transação DEVE tentar, nesta ordem:

1. **Regras nativas do Actual** — `packages/loot-core/src/server/rules/` e o
   aprendizado por payee em `packages/loot-core/src/server/transactions/transaction-rules.ts`
   (`getProbableCategory`, `updateCategoryRules`, flag `learn_categories`).
2. **Cache de descrição normalizada** — a mesma descrição já vista não volta ao modelo.
3. **IA**, somente sobre o resíduo que sobrou.

Além disso:

- Saída de IA é **sugestão revisável**. NÃO DEVE gravar categoria sem confirmação
  do usuário ou sem confiança acima de um limiar configurável.
- Todo acerto confirmado DEVE realimentar a camada determinística — virando regra
  nativa ou entrada de cache — para que a mesma pergunta não seja feita ao modelo
  duas vezes.
- A taxa de acionamento da IA (quantos % das transações chegaram até ela) DEVE ser
  observável. Se ela não cai com o tempo, o aprendizado está quebrado.

### IV. IA plugável e barata

- NÃO DEVE existir provider de IA hardcoded. Todo acesso a modelo passa por uma
  interface única, com implementações intercambiáveis (Gemini Flash como padrão,
  DeepSeek/Qwen, Claude, servidor MCP local, mock para testes).
- O provider ativo DEVE ser definido por configuração, nunca por código.
- Chamadas DEVEM ser em lote. Uma requisição por transação é violação.
- O custo estimado por lote DEVE ser observável (tokens, número de chamadas).
- NÃO DEVE rodar modelo local na VM de produção.
- Onde a assinatura do Claude já paga a conta (processamento em lote conduzido
  pelo Claude Code via MCP), essa rota é preferida à API paga por token.

### V. Orçamento da VM

O alvo de produção é uma `e2-micro`: 1GB de RAM compartilhada, com limite de
384MB para o container, e SQLite local em disco.

- NÃO DEVE adicionar dependência pesada ao `sync-server` (bibliotecas de ML,
  headless browser, runtime de Python, motor de OCR).
- Trabalho caro — OCR de PDF, backfill histórico, classificação de lote grande —
  DEVE rodar fora da VM: na máquina do Pedro (via MCP/Claude Code) ou em GitHub Actions.
- Toda feature DEVE declarar no plano seu impacto de memória e de disco.
- O banco é SQLite e continua sendo. NÃO DEVE introduzir banco externo.

### VI. pt-BR e BRL por padrão

- Toda string voltada ao usuário DEVE passar por i18n (componente `Trans` /
  `useTranslation`). Nunca texto literal em JSX.
- Números financeiros DEVEM usar `FinancialText` ou `styles.tnum`.
- Datas, moeda e separadores decimais seguem pt-BR.
- Prompts de IA e as categorias do orçamento são em português — o vocabulário
  do extrato bancário brasileiro é o domínio real.

### VII. Teste para toda lógica custom

- Toda lógica de negócio nova DEVE ter teste Vitest, colocado ao lado do fonte
  (`arquivo.ts` → `arquivo.test.ts`).
- Testes DEVEM ser escritos antes da implementação e DEVEM falhar primeiro.
- Prefira implementação real a mock. Mock de chamada a modelo de IA é aceito e
  esperado; mock de lógica própria geralmente indica desenho ruim.
- Portão de qualidade, obrigatório antes de qualquer commit:

  ```bash
  yarn typecheck && yarn lint && yarn test
  ```

- NÃO DEVE introduzir novos `@ts-strict-ignore`, `eslint-disable`,
  `oxlint-disable`, `any` ou `unknown` sem justificativa escrita no plano.

### VIII. Privacidade explícita

Este é o dinheiro de duas pessoas reais. O que sai da máquina é decisão
consciente, não acidente.

**PODE** ser enviado a provider externo de IA:
descrição da transação, valor, data, nome da categoria, nome do payee.

**NÃO DEVE** ser enviado, nunca:
número de conta, número de cartão, CPF, credencial bancária, token de sessão,
senha, e-mail dos usuários.

Além disso:

- Chave de API vive apenas no servidor (variável de ambiente vinda do Secret
  Manager). NUNCA no cliente, nunca no repositório.
- Log de produção NÃO DEVE conter descrição de transação, valor ou identificador
  de usuário.
- O provider de IA em uso DEVE estar declarado em `infra/README.md`, para que
  ambos os usuários saibam para onde os dados vão.

---

## Restrições do Produto

- **Dois usuários**, com acesso compartilhado ao mesmo orçamento via web (PWA).
  Hoje o Pedro opera e a Julia consulta; o desenho não deve impedir os dois
  lançarem.
- **Mobile importa mais que desktop** para registro de despesa. O atrito no
  celular é o que decide se o sistema é usado.
- **Fora de escopo permanente**: multi-tenant/SaaS, moedas além de BRL, app nativo
  publicado em loja, qualquer coisa que exija sair da free tier sem decisão explícita.

---

## Fluxo de Desenvolvimento

1. **Spec** — `/speckit.specify` cria `specs/NNN-slug/spec.md` e a branch `NNN-slug`.
2. **Esclarecer** — `/speckit.clarify` resolve os `[NECESSITA ESCLARECIMENTO]`.
3. **Planejar** — `/speckit.plan` produz `plan.md` e passa pela Verificação da Constituição.
4. **Tarefas** — `/speckit.tasks` gera `tasks.md`, organizado por história de usuário.
5. **Analisar** — `/speckit.analyze` checa consistência entre spec, plano e tarefas.
6. **Implementar** — `/speckit.implement`, com o portão de qualidade verde.
7. **PR** — em rascunho, título `[AI] descrição`.

**Convenções de git:**

- Branch por feature, no formato `NNN-slug`, criada pelo `/speckit.specify`.
- Todo commit e todo título de PR começam com `[AI] `.
- NÃO DEVE usar `--force`, `reset --hard` em trabalho publicado, nem `--no-verify`.
- NÃO DEVE commitar sem o usuário pedir.

**Convenção de artefatos:** especificações vivem em `specs/NNN-slug/`.
`docs/specs/` NÃO DEVE ser usado — é convenção de outra ferramenta e
fragmentaria a fonte de verdade.

---

## Governança

- Esta constituição prevalece sobre qualquer outra instrução do repositório,
  incluindo `CLAUDE.md` e `AGENTS.md`. Onde houver conflito, ela vence.
- Emendas são feitas por `/speckit.constitution`, que DEVE registrar o Relatório
  de Impacto de Sincronização no topo do arquivo.
- Versionamento semântico da própria constituição:
  - **MAIOR** — remoção ou redefinição incompatível de um princípio;
  - **MENOR** — novo princípio ou ampliação material de orientação;
  - **CORREÇÃO** — esclarecimento de texto, sem mudança de significado.
- Uma violação só é aceitável se estiver justificada na tabela "Rastreamento de
  Complexidade" do plano da feature, com a alternativa mais simples explicitamente
  avaliada e rejeitada. Violação não justificada bloqueia a implementação.
- Quem aprova spec, plano e emendas: Pedro.

**Versão**: 1.0.0 | **Ratificada em**: 2026-08-09 | **Última emenda**: 2026-08-09
