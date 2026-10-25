# Tarefas: Acesso remoto e pelo celular ao assistente financeiro

**Spec**: `specs/010-acesso-remoto-mcp/spec.md`
**Plano**: `specs/010-acesso-remoto-mcp/plan.md`
**Contratos**: `specs/010-acesso-remoto-mcp/contracts/` · **Dados**: `data-model.md` · **Verificação manual**: `quickstart.md`

## Formato

```
- [ ] T012 [P] [US1] Descrição da tarefa com o caminho do arquivo
```

- `T###` — id sequencial, contínuo em todas as fases.
- `[P]` — pode rodar em paralelo (arquivos diferentes, sem dependência entre si).
- `[US#]` — história de usuário. **Só** nas fases de história.
- Toda tarefa cita o caminho do arquivo que toca. `SRC` abaixo significa `packages/custom/mcp-financeiro/src` (escrito por extenso em cada tarefa).

> **Testes (princípio VII)**: dentro de cada história, os testes vêm **antes** da implementação e **DEVEM ser escritos e falhar primeiro**. Prefira implementação real a mock; mockar o Google e o Actual (serviços externos) é esperado.
> **Portão de qualidade**: `yarn typecheck && yarn lint && yarn test` verdes antes de cada commit.
> **Tarefas manuais** (`[MANUAL]`) exigem ação do Pedro no GCP/Google/aparelho; ficam com evidência no `quickstart.md`.

## Ordem das fases e portões

```
Fase 1 Setup ─▶ Fase 2 Fundação ─▶ Fase 3 US1 (consulta remota) ─▶ Fase 4 US2 (revogar) ─▶ Fase 5 US3 (Julia)
                                                  └──────────────────── USO REAL só após US2 ────────────────┘
                                                                                            │
                         ⚠️ PORTÃO: PR #17 (emenda 2.0.0 ao princípio III) MERGEADO ─────────▶ Fase 6 US4 (escrita)
                                                                                            └──▶ Fase 7 Polimento
```

---

## Fase 1 — Setup (infraestrutura compartilhada)

- [ ] T001 Atualizar a branch `010-acesso-remoto-mcp` com a branch principal (traz a `005` mergeada, `packages/custom/mcp-financeiro/`, e a emenda se o PR #17 já estiver mergeado) e conferir que `packages/custom/mcp-financeiro/src/server.ts` e `source.ts` existem e os testes da 005 passam
- [ ] T002 [P] Spike S-1: no SDK fixado em `packages/custom/package.json` (`@modelcontextprotocol/sdk` 1.32.1) confirmar roteador de autorização com _client store_ customizado, tratamento de `resource` e `401` com `WWW-Authenticate`; registrar o resultado e o plano B em `specs/010-acesso-remoto-mcp/research.md` (tabela de spikes)
- [ ] T003 [P] Spike S-3: abrir o orçamento com `sessionToken` em diretório temporário (sem disco persistente) e medir o tempo de abertura; registrar em `specs/010-acesso-remoto-mcp/research.md`
- [ ] T004 [P] [MANUAL] Spike S-5: criar o cliente OAuth novo do Google (`financas-mcp`, escopos `openid email`, Pedro e Julia como usuários de teste) e confirmar que o `id_token` traz `email`; registrar em `specs/010-acesso-remoto-mcp/research.md` (o redirect definitivo é preenchido na T049)
- [ ] T005 Ajustar `packages/custom/tsconfig.json` e `packages/custom/package.json` se o spike T002 exigir (só **adicionar** dependências; nenhuma é prevista) e criar o diretório `packages/custom/mcp-financeiro/src/remoto/` com um `index.ts` vazio exportado

---

## Fase 2 — Fundação (pré-requisito bloqueante)

> **⚠️ CRÍTICO**: nenhuma história começa antes desta fase terminar. Aqui nascem as peças de segurança reutilizadas por todas as histórias.

### Testes da Fundação (escrever primeiro; devem falhar)

- [ ] T006 [P] Teste de `config`: variável ausente/inválida ⇒ modo de recusa total com o **nome** da variável (nunca o valor), padrões de TTL/limites, política de redirects, faixa de origem vazia = desligada, em `packages/custom/mcp-financeiro/src/remoto/config.test.ts`
- [ ] T007 [P] Teste de `tokens`: JWT HS256 (assinatura, `aud`, `exp`, adulteração, algoritmo trocado), HKDF com subchaves distintas por finalidade, refresh opaco com hash, em `packages/custom/mcp-financeiro/src/remoto/tokens.test.ts`
- [ ] T008 [P] Teste de `acessos` (regras puras): conceder, expirar por inatividade e por limite absoluto, rotacionar refresh, **reuso de refresh encerra o acesso**, encerrar um/todos (`revogadoAntesDe`), pessoa removida, teto de 10 por pessoa, limpeza após 90 dias, em `packages/custom/mcp-financeiro/src/remoto/acessos.test.ts`
- [ ] T009 [P] Teste do contrato de `estado-store` (implementação em memória): leitura com cache ≤ 30 s, escrita com conflito de geração ⇒ relê, reaplica e repete até 5 vezes, depois erro distinguível, em `packages/custom/mcp-financeiro/src/remoto/estado-store.test.ts`
- [ ] T010 [P] Teste de `estado-gcs` contra um `fetch` falso: `ifGenerationMatch`, `412` ⇒ retry, objeto ausente ⇒ estado inicial vazio, nenhum segredo em erro, em `packages/custom/mcp-financeiro/src/remoto/estado-gcs.test.ts`
- [ ] T011 [P] Teste de `autorizadas`: 2 entradas OK; arquivo ausente, JSON inválido, vazio ou > 2 entradas ⇒ **ninguém entra**; comparação de e-mail sem diferenciar maiúsculas; relê em ≤ 30 s; nunca expõe o e-mail, em `packages/custom/mcp-financeiro/src/remoto/autorizadas.test.ts`
- [ ] T012 [P] Teste de `limites`: janela deslizante por IP (falhas, `/register`, `/authorize`) e por acesso (consultas), `Retry-After`, em `packages/custom/mcp-financeiro/src/remoto/limites.test.ts`
- [ ] T013 [P] Teste de `origem`: IP a partir de `X-Forwarded-For` (posição confiável), CIDR, lista vazia = permitido, IPv6, em `packages/custom/mcp-financeiro/src/remoto/origem.test.ts`
- [ ] T014 [P] Teste de `auditoria`: **só** os campos da lista fechada de `contracts/auditoria.md`; um teste injeta e-mail, IP, valor, parâmetros, `code`, token e verifica que **nada** disso sai, em `packages/custom/mcp-financeiro/src/remoto/auditoria.test.ts`

### Implementação da Fundação

- [ ] T015 [P] Implementar `config` (variáveis e secrets, falha fechada) em `packages/custom/mcp-financeiro/src/remoto/config.ts`
- [ ] T016 [P] Implementar `tokens` (JWT HS256 + HKDF com `node:crypto`, refresh opaco/hash) em `packages/custom/mcp-financeiro/src/remoto/tokens.ts`
- [ ] T017 Implementar as regras de `acessos` (puras, sem I/O) segundo `data-model.md §1`, em `packages/custom/mcp-financeiro/src/remoto/acessos.ts`
- [ ] T018 Implementar a interface e a versão em memória de `estado-store` em `packages/custom/mcp-financeiro/src/remoto/estado-store.ts`
- [ ] T019 Implementar `estado-gcs` (REST do Cloud Storage com token do servidor de metadados ou injetado; sem SDK) em `packages/custom/mcp-financeiro/src/remoto/estado-gcs.ts`
- [ ] T020 [P] Implementar `autorizadas` (arquivo montado, relido, falha fechada) em `packages/custom/mcp-financeiro/src/remoto/autorizadas.ts`
- [ ] T021 [P] Implementar `limites` em `packages/custom/mcp-financeiro/src/remoto/limites.ts`
- [ ] T022 [P] Implementar `origem` (IP real e filtro de faixa opcional) em `packages/custom/mcp-financeiro/src/remoto/origem.ts`
- [ ] T023 [P] Implementar `auditoria` (logger de lista fechada em `stdout`) em `packages/custom/mcp-financeiro/src/remoto/auditoria.ts`

**Checkpoint**: fundação pronta — `yarn workspace @actual-financas/custom test` verde; as histórias podem começar.

---

## Fase 3 — História 1: Perguntar do celular o mesmo que no Mac (P1) 🎯 MVP

**Objetivo**: cadastrar o conector uma vez e consultar do celular (Claude e um segundo provedor) com login Google, mesmas respostas e mesma máscara do Mac.
**Teste independente**: com o serviço implantado, conectar o conector no celular e fazer "gasto por categoria em [mês]" e "o que está sem categoria?"; os totais batem ao centavo com o Claude Code no Mac (CS-003). **Atenção**: a consulta remota **só entra em uso real depois da História 2** (revogação).

### Testes da História 1 (escrever primeiro; devem falhar)

- [ ] T024 [P] [US1] Teste de `client-id`: DCR sem estado (documento assinado), política de redirects (aceita `claude.ai`/`claude.com`/`chatgpt.com/connector/oauth/*` e _loopback_ com qualquer porta; recusa host estranho, `http` fora de _loopback_, fragmento, esquema personalizado), `token_endpoint_auth_method` ≠ `none` recusado, em `packages/custom/mcp-financeiro/src/remoto/client-id.test.ts`
- [ ] T025 [P] [US1] Teste de `paginas` (consentimento e erro): escape de HTML, CSP `default-src 'none'`, `frame-ancestors 'none'`, CSRF, host do retorno em destaque, rótulo 1–40 caracteres, `Cache-Control: no-store`, em `packages/custom/mcp-financeiro/src/remoto/paginas.test.ts`
- [ ] T026 [P] [US1] Teste de `google-identity` com Google simulado: valida `iss`, `aud`, `exp`, `nonce`, `email_verified`; `state` adulterado/expirado/sem cookie ⇒ recusa; e-mail fora da lista ⇒ recusa **sem** dizer o motivo; descarta tokens do Google; nunca registra o e-mail, em `packages/custom/mcp-financeiro/src/remoto/google-identity.test.ts`
- [ ] T027 [P] [US1] Teste de `oauth-provider`: PKCE S256 obrigatório, código de uso único e de 60 s, `redirect_uri` idêntico, `resource` = URL do `/mcp`, refresh rotativo, `invalid_grant` (e **só** ele) quando o refresh deixa de valer com `error_description` "acesso expirado"/"acesso encerrado", em `packages/custom/mcp-financeiro/src/remoto/oauth-provider.test.ts`
- [ ] T028 [P] [US1] Teste de `mcp-http`: `401` **idêntico** para sem token, token mal formado, assinatura inválida, expirado, audiência errada, acesso encerrado; `POST /mcp` sem sessão com resposta JSON; `GET`/`DELETE` ⇒ `405`; `Origin` estranho ⇒ `403`; corpo > 100 kB recusado; token na _query string_ ignorado, em `packages/custom/mcp-financeiro/src/remoto/mcp-http.test.ts`
- [ ] T029 [P] [US1] Teste de contrato ponta a ponta **sem fornecedor** com o cliente genérico do SDK (descoberta ⇒ registro ⇒ autorização com Google simulado ⇒ consentimento ⇒ token ⇒ refresh ⇒ `tools/list` ⇒ `tools/call`) e a **bateria CS-004** (sem credencial, adulterado, expirado, outra audiência, conta fora da lista), em `packages/custom/mcp-financeiro/src/remoto/contrato.e2e.test.ts`
- [ ] T030 [P] [US1] Teste de segurança: cabeçalhos (`Strict-Transport-Security`, `nosniff`, `no-referrer`, `no-store`), sem CORS, `429` com `Retry-After`, `/saude` não toca o Actual nem o estado, nenhum segredo em respostas de erro, em `packages/custom/mcp-financeiro/src/remoto/seguranca.test.ts`
- [ ] T031 [P] [US1] Teste de `protocol` (`instructions`): contém definição de sobra, "não há dados no período", bloco período/definições, recusas; e **sincronia com o subagente** (frases-chave também em `.claude/agents/assistente-financeiro.md`), em `packages/custom/mcp-financeiro/src/protocol.test.ts`
- [ ] T032 [P] [US1] Estender testes do servidor: `instructions` presentes no `initialize` e `atualizado_em` em toda resposta de consulta; consultas intactas (paridade com a 005), em `packages/custom/mcp-financeiro/src/server.test.ts`
- [ ] T033 [P] [US1] Teste de `refresh()` da fonte: sincroniza só se a última sincronização tem > 5 min, serializa chamadas simultâneas, expõe o instante, em `packages/custom/mcp-financeiro/src/source.test.ts`

### Implementação da História 1

- [ ] T034 [P] [US1] Implementar `protocol` (definições e protocolo de resposta, pt-BR, fonte única) em `packages/custom/mcp-financeiro/src/protocol.ts`
- [ ] T035 [US1] Editar `createFinancasServer` para entregar `instructions` e `atualizado_em` nas respostas (arquivo da 005, mudança aditiva) em `packages/custom/mcp-financeiro/src/server.ts`
- [ ] T036 [US1] Editar a fonte do orçamento para ter `refresh()` com idade máxima e exposição do instante da última sincronização (arquivo da 005, aditivo) em `packages/custom/mcp-financeiro/src/source.ts`
- [ ] T037 [P] [US1] Implementar `client-id` (documento assinado + política de redirects configurável) em `packages/custom/mcp-financeiro/src/remoto/client-id.ts`
- [ ] T038 [P] [US1] Implementar `paginas` (HTML pt-BR de consentimento e erro, texto "consultar as finanças — somente leitura" nesta fase) em `packages/custom/mcp-financeiro/src/remoto/paginas.ts`
- [ ] T039 [US1] Implementar `google-identity` (code + nonce + state assinados, validação do `id_token`, lista de autorizadas) em `packages/custom/mcp-financeiro/src/remoto/google-identity.ts`
- [ ] T040 [US1] Implementar o provedor OAuth sobre o roteador do SDK (autorizar, trocar código, refresh rotativo, revogar, verificar token com checagem do acesso no estado) em `packages/custom/mcp-financeiro/src/remoto/oauth-provider.ts`
- [ ] T041 [US1] Implementar `mcp-http` (`POST /mcp` sem sessão, bearer, audiência, limites, auditoria, `405`) em `packages/custom/mcp-financeiro/src/remoto/mcp-http.ts`
- [ ] T042 [US1] Compor o app (rotas OAuth, `/.well-known/*`, `/saude`, cabeçalhos, limites, corpo ≤ 100 kB, sem CORS, partida que abre o orçamento em segundo plano) em `packages/custom/mcp-financeiro/src/remoto/app.ts`
- [ ] T043 [US1] Criar o ponto de entrada do serviço (lê config/secrets, monta store GCS e fonte do Actual) em `packages/custom/mcp-financeiro/bin/servidor-remoto.mjs`
- [ ] T044 [US1] Spike S-6 + imagem: escrever a imagem enxuta (Node ≥ 22.18, `yarn workspaces focus @actual-financas/custom --production`, módulo nativo do SQLite) em `packages/custom/Dockerfile.mcp-remoto` e registrar o resultado do spike em `specs/010-acesso-remoto-mcp/research.md`
- [ ] T045 [US1] Escrever a infraestrutura nova: Cloud Run (`min 0`, `max 1`, 512 MiB, concorrência 8, `startup-cpu-boost`), conta de serviço mínima, bucket do estado (privado, versionado, ciclo de vida), Artifact Registry com limpeza, _containers_ dos secrets (com `financas-mcp-pessoas` montado como arquivo), **exclusão dos logs de requisição do Cloud Run**, `mcp-deployer` no WIF, variáveis (inclui `REDIRECTS_PERMITIDOS`) em `infra/mcp-remoto.tf`
- [ ] T046 [US1] Acrescentar os papéis que o `tf-deployer` precisa para criar esses recursos (Cloud Run, Artifact Registry, Service Usage), mudança aditiva e comentada, em `infra/iam.tf`
- [ ] T047 [US1] Escrever o workflow de deploy (WIF, build e push da imagem, `gcloud run deploy`, **smoke test**: `POST /mcp` sem token ⇒ `401` com `WWW-Authenticate`; `/.well-known/oauth-protected-resource` ⇒ `200`; `/saude` ⇒ `200`; consulta de logs de requisição ⇒ vazia; rollback para a revisão anterior se falhar; `concurrency` sem cancelar deploy), adaptado do `smartdata-platform`, em `.github/workflows/deploy-mcp.yml`
- [ ] T048 [US1] Impedir que mudanças só em `packages/custom/**` redeployem o Actual na VM, cercando a edição com `>>> CUSTOM / <<< CUSTOM`, em `.github/workflows/deploy-gce.yml`
- [ ] T049 [US1] [MANUAL] Primeira implantação conforme `quickstart.md` Parte A: `terraform apply` à mão, anotar `url_publica`, completar o redirect do cliente Google (`<URL_PUBLICA>/google/callback`), popular os secrets (`financas-mcp-segredo`, `-pessoas`, `-google-secret`, `-actual-token`, `-actual-sync-id`), disparar o deploy; evidência em `specs/010-acesso-remoto-mcp/quickstart.md`
- [ ] T050 [US1] [MANUAL] Spike S-4: com o serviço no ar, confirmar a posição confiável do IP em `X-Forwarded-For`; ajustar `packages/custom/mcp-financeiro/src/remoto/origem.ts` e `origem.test.ts` se preciso
- [ ] T051 [US1] [MANUAL] Spike S-2 / bateria: conectar no **claude.ai e no app do celular** (quickstart B1) e em **um segundo provedor** (B3, CS-012); rodar C1, C2, C3, C9, C10, C11, C12 e C14 do `quickstart.md`; registrar tempos e achados (ajustar a lista de redirects em `infra/mcp-remoto.tf` se algum provedor for recusado)

**Checkpoint**: História 1 funcional e testável sozinha (mas **não liberada para uso real** antes da História 2).

---

## Fase 4 — História 2: Encerrar ou renovar um acesso em minutos (P2)

**Objetivo**: ver os acessos, encerrar um/todos/uma pessoa, ver o histórico — sem o aparelho em mãos.
**Teste independente**: com um acesso ativo, encerrá-lo pelo CLI e ver a próxima pergunta do aparelho falhar em ≤ ~1 min; reautorizar e voltar a funcionar.

### Testes da História 2 (escrever primeiro; devem falhar)

- [ ] T052 [P] [US2] Teste das regras e da saída do CLI (`listar`, `encerrar <id|rótulo>` com ambiguidade ⇒ nada acontece e lista candidatos, `encerrar-todos` com confirmação, `pessoa-remover`, códigos de saída, nenhuma impressão de e-mail/token/hash), em `packages/custom/mcp-financeiro/src/remoto/acessos-cli.test.ts`
- [ ] T053 [P] [US2] Teste ponta a ponta de revogação: encerrar um ⇒ próximo pedido `401` dentro do cache de 30 s e os demais seguem; `encerrar-todos` invalida até tokens já emitidos; pessoa removida do secret ⇒ acessos dela caem; expiração por inatividade ⇒ reautorizar sem recadastrar o conector; reuso de refresh ⇒ acesso encerrado, em `packages/custom/mcp-financeiro/src/remoto/revogacao.e2e.test.ts`
- [ ] T054 [P] [US2] Teste do leitor de histórico (filtra eventos de auditoria do serviço, formata `data · evento · rótulo · ferramenta · resultado`, ignora linhas fora do contrato), em `packages/custom/mcp-financeiro/src/remoto/historico.test.ts`

### Implementação da História 2

- [ ] T055 [US2] Implementar as operações do CLI sobre `acessos`/`estado-store` (listar, encerrar, encerrar-todos, pessoa-remover) e a formatação, em `packages/custom/mcp-financeiro/src/remoto/acessos-cli.ts`
- [ ] T056 [P] [US2] Implementar o leitor de histórico (Cloud Logging via `gcloud`) em `packages/custom/mcp-financeiro/src/remoto/historico.ts`
- [ ] T057 [US2] Criar o executável do CLI (argumentos, token do `gcloud`, saída, códigos) e registrar o script `acessos` em `packages/custom/mcp-financeiro/bin/acessos.mjs` e `packages/custom/package.json`
- [ ] T058 [P] [US2] Documentar o runbook de emergência (encerrar tudo sem Mac pelo console, trocar o segredo mestre, desligar o acesso público) em `specs/010-acesso-remoto-mcp/quickstart.md` (Parte D) e no resumo operacional de `infra/README.md`
- [ ] T059 [US2] [MANUAL] Rodar C4, C5, C6 e C7 do `quickstart.md` no serviço real e registrar a evidência; só então marcar a feature como **liberada para uso real**

**Checkpoint**: Histórias 1 e 2 funcionais — **ponto de liberação para uso real da consulta remota**.

---

## Fase 5 — História 3: A Julia também consegue usar (P3)

**Objetivo**: a Julia conecta no próprio celular e seu acesso é independente do do Pedro.
**Teste independente**: Julia cadastra o conector, pergunta o gasto do mês e recebe o mesmo resultado; encerrar o acesso dela não afeta o do Pedro, e vice-versa.

### Testes da História 3 (escrever primeiro; devem falhar)

- [ ] T060 [P] [US3] Teste ponta a ponta com duas pessoas autorizadas: dois acessos independentes, encerrar um não derruba o outro, o histórico distingue os dois pelo rótulo, e um terceiro e-mail é recusado, em `packages/custom/mcp-financeiro/src/remoto/duas-pessoas.e2e.test.ts`

### Implementação da História 3

- [ ] T061 [US3] [MANUAL] Incluir o e-mail da Julia em `financas-mcp-pessoas` e como usuária de teste do cliente Google; ela conecta (quickstart B2); registrar o resultado em `specs/010-acesso-remoto-mcp/quickstart.md`
- [ ] T062 [US3] Ajustar a mensagem de "conta sem acesso" e o texto do consentimento se a Julia revelar confusão de uso (sem expor a lista), em `packages/custom/mcp-financeiro/src/remoto/paginas.ts` e `paginas.test.ts`

**Checkpoint**: Histórias 1, 2 e 3 funcionais.

---

## Fase 6 — História 4: Arrumar o orçamento conversando (P4)

> **⚠️ PORTÃO**: esta fase só começa com o **PR #17 (emenda 2.0.0 ao princípio III) mergeado**. Se ele ainda estiver aberto, pare aqui. Ao final, a liberação **encerra todos os acessos** para que cada aparelho reautorize com o texto novo de consentimento (T081).

**Objetivo**: o Claude (e qualquer cliente) categoriza, lança, edita e apaga — transações, regras, categorias/grupos, contas e orçamento — com mensagens de risco, simulação opcional e auditoria.
**Teste independente**: no Actual de teste, categorizar um grupo de transações sem categoria, lançar uma despesa e apagar uma transação de teste; conferir no app do Actual e que cada resposta trouxe o risco (quickstart W1–W9).

### Spike

- [ ] T063 [US4] Spike W-1: confirmar na API do Actual fixada (26.10.0) as operações de cada linha do catálogo de `contracts/ferramentas-escrita.md` e como detectar transação conciliada; registrar em `specs/010-acesso-remoto-mcp/research.md` e marcar no contrato o que for "indisponível"

### Testes da História 4 (escrever primeiro; devem falhar)

- [ ] T064 [P] [US4] Teste da classificação de risco: cada linha da tabela, regra do **maior** nível, `+1` por mês passado (teto: alto), limiares configuráveis (`RISCO_LOTE_MEDIO`, `RISCO_LOTE_GRANDE`), `irreversivel` em todo `apagar_*`, em `packages/custom/mcp-financeiro/src/escrita/risco.test.ts`
- [ ] T065 [P] [US4] Teste do escritor (adaptador da API do Actual) com cliente falso: mapeamento de operações, resolução de nome ⇒ id com erro em ambiguidade/inexistência, serialização das escritas, `sync` ao final e `sincronizado:false` quando falha, em `packages/custom/mcp-financeiro/src/escrita/escritor.test.ts`
- [ ] T066 [P] [US4] Teste das ferramentas de escrita contra um **escritor falso que registra chamadas**: `simular:true` ⇒ zero gravações; parâmetro inválido/ambíguo ⇒ zero gravações; lote é tudo-ou-nada; resposta traz `risco`, `irreversivel`, `efeito`; descrição de **toda** ferramenta declara risco e irreversibilidade; `readOnlyHint:false`, em `packages/custom/mcp-financeiro/src/escrita/ferramentas.test.ts`
- [ ] T067 [P] [US4] Teste "consulta nunca escreve": percorre **todas** as ferramentas de consulta com o escritor falso e exige zero chamadas, em `packages/custom/mcp-financeiro/src/escrita/somente-consulta.test.ts`
- [ ] T068 [P] [US4] Teste do interruptor (`escritaHabilitada`): desligado ⇒ toda escrita falha com a mensagem do contrato e as consultas seguem; relido em ≤ 30 s, em `packages/custom/mcp-financeiro/src/escrita/interruptor.test.ts`
- [ ] T069 [P] [US4] Estender o teste de auditoria com o evento `escrita` (`operacao`, `quantidade`, `risco`, `resultado` incluindo `simulado`/`desligado`), sem descrição/valor/e-mail/IP, em `packages/custom/mcp-financeiro/src/remoto/auditoria.test.ts`
- [ ] T070 [P] [US4] Estender o teste de `protocol` com as instruções de escrita (texto de extrato é dado, simular antes de risco médio/alto, nunca apagar por iniciativa, resumir o efeito, perguntar em caso de dúvida) e a sincronia com o subagente, em `packages/custom/mcp-financeiro/src/protocol.test.ts`
- [ ] T071 [P] [US4] Atualizar os testes da lista de ferramentas e da guarda do Claude Code para incluir as ferramentas de escrita (a lista fechada muda de propósito) em `packages/custom/mcp-financeiro/src/tool-surface.test.ts`, `packages/custom/mcp-financeiro/src/hook-guard.test.ts` (criar se não existir) e `packages/custom/mcp-financeiro/src/agent-config.test.ts`
- [ ] T072 [P] [US4] Teste de que `transacoes` e `sem_categoria` devolvem o `id` de cada transação (pré-requisito das ferramentas de escrita), em `packages/custom/mcp-financeiro/src/analysis.test.ts`
- [ ] T073 [P] [US4] Teste do CLI `acessos escrita desligar|ligar|status`, em `packages/custom/mcp-financeiro/src/remoto/acessos-cli.test.ts`

### Implementação da História 4

- [ ] T074 [P] [US4] Implementar a classificação de risco (código puro) em `packages/custom/mcp-financeiro/src/escrita/risco.ts`
- [ ] T075 [US4] Implementar a interface do escritor e o adaptador da API do Actual (criar/editar/apagar por área, serialização, `sync`) em `packages/custom/mcp-financeiro/src/escrita/escritor.ts`
- [ ] T076 [P] [US4] Implementar a leitura do interruptor `escritaHabilitada` a partir do estado em `packages/custom/mcp-financeiro/src/escrita/interruptor.ts`
- [ ] T077 [US4] Registrar as ferramentas de escrita (`categorizar_transacoes`, `lancar_transacao`, `editar_transacao`, `apagar_transacoes`, regras, categorias/grupos, contas, `definir_orcamento`) com risco estático na descrição, `simular`, resposta com risco/efeito e auditoria, em `packages/custom/mcp-financeiro/src/escrita/ferramentas.ts`
- [ ] T078 [US4] Fazer `createFinancasServer` aceitar um escritor opcional (consultas continuam sem ele) e registrar as ferramentas de escrita só quando houver escritor (arquivo da 005, aditivo) em `packages/custom/mcp-financeiro/src/server.ts`
- [ ] T079 [P] [US4] Devolver o `id` de cada transação em `transacoes` e `sem_categoria` (aditivo) em `packages/custom/mcp-financeiro/src/analysis.ts`
- [ ] T080 [US4] Acrescentar as instruções de escrita ao protocolo (contrato `ferramentas-escrita.md`, seção `instructions`) em `packages/custom/mcp-financeiro/src/protocol.ts`
- [ ] T081 [US4] Atualizar o texto de consentimento para "consultar **e alterar** as finanças" e, no momento de liberar a escrita em produção, registrar a tarefa operacional de **encerrar todos os acessos** (reautorização com o texto novo) em `packages/custom/mcp-financeiro/src/remoto/paginas.ts` e `specs/010-acesso-remoto-mcp/quickstart.md`
- [ ] T082 [US4] Passar a guarda do Claude Code a **permitir** as ferramentas de escrita (lista fechada atualizada) e listar as ferramentas no subagente, em `packages/custom/mcp-financeiro/src/tool-surface.ts`, `packages/custom/mcp-financeiro/src/hook-guard.ts` e `.claude/agents/assistente-financeiro.md`
- [ ] T083 [US4] Ligar o escritor nos dois pontos de entrada (local por Chaveiro e remoto por secrets) em `packages/custom/mcp-financeiro/bin/servidor.mjs` e `packages/custom/mcp-financeiro/bin/servidor-remoto.mjs`
- [ ] T084 [US4] Acrescentar `acessos escrita desligar|ligar|status` ao CLI e o campo `escritaHabilitada` ao estado, em `packages/custom/mcp-financeiro/src/remoto/acessos-cli.ts` e `packages/custom/mcp-financeiro/src/remoto/acessos.ts`
- [ ] T085 [US4] [MANUAL] Rodar a bateria W1–W9 do `quickstart.md` (incluindo o **ensaio de restauração do backup** em ambiente de teste, W8), liberar a escrita em produção encerrando todos os acessos (T081) e registrar a evidência em `specs/010-acesso-remoto-mcp/quickstart.md`

**Checkpoint**: Histórias 1–4 funcionais; escrita auditada, com risco informado e interruptor.

---

## Fase 7 — Polimento e Transversais

- [ ] T086 Declarar os terceiros novos (Google Cloud: Cloud Run, Artifact Registry, Secret Manager, Cloud Storage, Cloud Logging; Google para login, só e-mail; e **cada provedor de IA conectado** como destinatário das respostas) e o serviço remoto no runbook, em `infra/README.md`
- [ ] T087 Propor a emenda de **correção** à constituição (tabela _Identidade → Hospedagem_ com o segundo alvo Cloud Run) via `/speckit.constitution`, em **PR separado**, em `.specify/memory/constitution.md`
- [ ] T088 [P] Atualizar o resumo operacional com o acesso remoto, o CLI `acessos` e o aviso sobre a autonomia da IA para escrever, em `CLAUDE.md` e `AGENTS.md`
- [ ] T089 [P] Varredura de segredos no repositório e na imagem (CS-008) e revisão do `terraform plan` (`infra/mcp-remoto.tf`): nenhum valor secreto em variável, `describe` do serviço ou log
- [ ] T090 [MANUAL] Medir o custo real após uma semana de uso (C13: ≤ R$ 20, esperado ≪) e o impacto na VM durante o uso (C12), registrando em `specs/010-acesso-remoto-mcp/quickstart.md`
- [ ] T091 Atualizar `specs/010-acesso-remoto-mcp/spec.md` (Status) e `specs/010-acesso-remoto-mcp/checklists/requirements.md` com o resultado final e o que ficou fora
- [ ] T092 `yarn typecheck && yarn lint && yarn test` verdes na raiz do repositório; `/speckit.analyze` e `/speckit.converge` antes de marcar o PR como pronto para revisão

---

## Dependências e Ordem de Execução

**Entre fases**

- Fase 1 → Fase 2 → (Fases 3, 4, 5, 6 conforme portões) → Fase 7.
- **Fase 3 (US1)** depende só da Fundação. **Fase 4 (US2)** depende da Fundação e do serviço implantado da US1 para a verificação manual (T059); os testes e o CLI (T052–T057) podem começar assim que a Fundação terminar.
- **Uso real** da consulta remota só depois da Fase 4 (T059). Isso é regra da spec (a História 2 torna aceitável o endereço público).
- **Fase 5 (US3)** depende da US1 e da US2 (precisa do serviço e da revogação).
- **Fase 6 (US4)** depende da Fundação, da US1 e da US2 e de um **portão externo**: PR #17 mergeado. Os testes T064–T073 podem ser **escritos** antes do merge, mas a implementação (T074+) só depois.
- **Fase 7**: T086–T088 e T091 podem ser adiantadas; T090 e T092 vêm no fim.

**Dentro de cada história**: testes (falhando) → regras puras → adaptadores → endpoints → infra/entrega → verificação manual.

**Dependências pontuais**

- T017 depende de T016 e T018; T019 depende de T018; T040 depende de T016, T017, T019, T037, T039; T041 depende de T040 e T035; T042 depende de T041 e T038; T043 depende de T042 e T036.
- T045 depende de T044; T047 depende de T044 e T045; T049 depende de T045–T048; T050 e T051 dependem de T049.
- T055 depende de T017/T018; T057 depende de T055 e T056.
- T077 depende de T074, T075, T076, T063; T078 depende de T077; T080 depende de T070; T083 depende de T075 e T078; T085 depende de tudo da Fase 6.

## Oportunidades de paralelismo

- **Fase 1**: T002, T003 e T004 juntas.
- **Fase 2**: todos os testes T006–T014 juntos (arquivos diferentes); depois T015, T016, T020–T023 juntos; T017–T019 em sequência.
- **Fase 3**: testes T024–T033 juntos; implementações T034, T037, T038 juntas; T035/T036 em sequência após os respectivos testes; infra (T044–T048) pode avançar em paralelo com T039–T043 por outra pessoa/sessão.
- **Fase 4**: T052–T054 juntos; T055 e T056 juntos.
- **Fase 6**: T064–T073 juntos; T074, T076, T079 juntos.
- **Fase 7**: T088 e T089 juntas.

## Estratégia de Entrega

1. **MVP técnico = Fase 1 + 2 + 3 (US1)**: consulta remota funcionando em dois provedores. Não é liberada para uso real ainda.
2. **Primeira liberação = + Fase 4 (US2)**: consulta remota **com** revogação em minutos, auditoria e emergência sem o Mac. É o ponto em que o casal pode passar a usar de fato.
3. **+ Fase 5 (US3)**: a Julia entra.
4. **+ Fase 6 (US4)**: escrita, depois do merge do PR #17, com a bateria W1–W9 e encerramento geral de acessos para reautorizar com o texto novo.
5. Cada fase termina num _checkpoint_ utilizável e reversível: o interruptor de escrita (T076/T084) e o `encerrar-todos` (T055) desfazem a liberação sem tocar no código.

**Total**: 92 tarefas — Setup 5 · Fundação 18 · US1 28 · US2 8 · US3 3 · US4 23 · Polimento 7.
