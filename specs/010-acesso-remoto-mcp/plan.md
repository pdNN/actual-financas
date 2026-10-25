# Plano de Implementação: Acesso remoto e pelo celular ao assistente financeiro

**Branch**: `010-acesso-remoto-mcp`
**Data**: 2026-10-25
**Spec**: `specs/010-acesso-remoto-mcp/spec.md`

---

## Resumo

O servidor MCP somente leitura da `005` ganha uma **segunda porta de entrada**: um
serviço **HTTP** que roda em **Cloud Run (escala a zero)** e que é, ao mesmo tempo, o
**recurso MCP** (`POST /mcp`) e o seu **servidor de autorização OAuth 2.1**. O casal
entra com a **conta Google que já usa no Actual**; só e-mails de uma lista curta de
autorizadas passam; cada aparelho recebe um _acesso_ com rótulo, que expira por
inatividade e pode ser encerrado em ≤ ~1 min. O serviço segue o padrão aberto de
conectores MCP, então **qualquer provedor de IA compatível** (Claude no celular, ChatGPT,
Gemini CLI, Cursor…) conecta com o mesmo passo — e novos provedores entram por
configuração. A esteira de implantação é adaptada da que o Pedro já usa no
`smartdata-platform`. Nada roda na VM do Actual; **o código das ferramentas é o mesmo da
`005`** (`createFinancasServer`), então números, máscara e somente-leitura são idênticos.

```
 celular / navegador / CLI                       Cloud Run  (max 1 instância, 512 MiB)
┌───────────────────────┐   HTTPS   ┌───────────────────────────────────────────────┐
│ Claude · ChatGPT · …  │──────────▶│ /.well-known/*   descoberta (RFC 9728 / 8414) │
│  (cliente MCP/OAuth)  │           │ /register        DCR sem estado (assinado)    │
└──────────┬────────────┘           │ /authorize ─▶ Google (OIDC) ─▶ /google/callback│
           │ login Google           │ /consentimento   rótulo + "autorizar leitura"  │
           ▼                        │ /token /revoke   JWT 15 min + refresh rotativo │
     accounts.google.com            │ POST /mcp        ferramentas 005 (só leitura)  │
                                    └───────┬───────────────┬──────────────┬────────┘
                                            │               │              │
                                  Secret Manager     GCS: estado.json   Actual (VM)
                                  (token Actual,     (lista de acessos) token de sessão,
                                   segredo mestre,                       1 download por
                                   Google client,                        partida a frio
                                   autorizadas)
```

---

## Contexto Técnico

| Item                        | Valor                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Linguagem / versão**      | TypeScript, Node ≥ 22.18 (roda `.ts` direto, como a `005`)                                                                                                                                                                                                       |
| **Dependências principais** | Já existentes no pacote `custom` (005): `@modelcontextprotocol/sdk` (inclui HTTP, roteador OAuth e bearer), `zod`, cliente do Actual. **Novas: nenhuma prevista** — Express já vem com o SDK; criptografia/JWT com `node:crypto`; GCS por REST (`fetch`) sem SDK |
| **Armazenamento**           | 1 objeto JSON no GCS (lista de acessos). Orçamento: cópia temporária em `/tmp` (memória) da instância. SQLite do Actual intocado                                                                                                                                 |
| **Testes**                  | Vitest ao lado do fonte; teste de contrato com cliente OAuth+MCP genérico; bateria de segurança (CS-004) automatizada; verificação guiada no `quickstart.md`                                                                                                     |
| **Plataforma alvo**         | Cloud Run (`us-east1`, projeto `actual-financas`); clientes: qualquer cliente MCP remoto                                                                                                                                                                         |
| **Tipo de projeto**         | Pacote custom no monorepo (`packages/custom/mcp-financeiro`) + Terraform novo + workflow novo                                                                                                                                                                    |
| **Metas de performance**    | Descoberta/registro/token em < 1 s mesmo na partida a frio (limite do Claude: 10 s); primeira ferramenta após inatividade < 30 s (CS-002); demais em segundos                                                                                                    |
| **Restrições**              | Somente leitura; nenhum segredo em repo/log; sem IP, e-mail ou conteúdo em log; custo ≤ R$ 20/mês; zero impacto na VM do Actual                                                                                                                                  |
| **Escala / escopo**         | 2 pessoas, ~dezenas de consultas/dia, até 10 acessos ativos por pessoa                                                                                                                                                                                           |
| **Pacotes tocados**         | `packages/custom/` (novo código); `infra/` (arquivo novo `mcp-remoto.tf`; roles em `iam.tf`; texto em `README.md`); `.github/workflows/` (arquivo novo `deploy-mcp.yml`; exclusão de caminho em `deploy-gce.yml`). **Nenhum arquivo do upstream**                |

### Impacto de memória, disco e custo (princípio V)

- **VM `e2-micro`**: **nenhum processo, nenhuma dependência.** O serviço novo é um _cliente_ a mais do Actual. Efeito: **um** login e **um** download do orçamento por partida a frio (ordem de KB a poucos MB), mais uma sincronização incremental no máximo a cada 5 min enquanto houver uso. Medição obrigatória no `quickstart.md` (RF-025, CS-010).
- **Cloud Run**: 512 MiB (o `/tmp` conta nessa memória), CPU 1, `max-instances=1`, concorrência 8, timeout 60 s. Sem disco persistente.
- **Custo** (estimativa, a confirmar na fatura; alerta já existe em `infra/budget.tf`): Cloud Run dentro da cota gratuita para esse volume; Artifact Registry (~centenas de MB, política de limpeza) e versões de secrets na casa de centavos; Cloud Logging e GCS dentro da cota gratuita. **Esperado R$ 0–5/mês**, folga ampla sobre o teto de R$ 20 (RF-024). `min-instances=1` custaria da ordem de metade do teto e foi rejeitado (research R-1).

---

## Verificação da Constituição

> **PORTÃO: passou antes da Fase 0; reavaliado após a Fase 1.**

- [x] **I — Especificação antes de código**: `spec.md` existe, com clarificações respondidas e nenhum marcador pendente. Esta pasta contém também o plano.
- [x] **II — Compatibilidade com upstream**: todo código novo em `packages/custom/`. **Nenhum arquivo do upstream é editado.** Arquivos _do fork_ (não do upstream) alterados, todos de infraestrutura e cercados por `>>> CUSTOM` quando já tinham o marcador: `infra/iam.tf` (acrescentar papéis ao `tf-deployer`), `infra/README.md` (declaração de terceiros), `.github/workflows/deploy-gce.yml` (exclusão de `packages/custom/**`; arquivo marcado como _custom_, não vem do upstream). Arquivos novos: `infra/mcp-remoto.tf`, `.github/workflows/deploy-mcp.yml`, `packages/custom/Dockerfile.mcp-remoto`. `package.json` do pacote `custom` só ganha entradas, se alguma. `yarn.lock` só muda se entrar dependência.
- [x] **III — Determinístico antes de IA**: esta feature não classifica nem grava. Todos os números vêm das ferramentas determinísticas da `005`; autorização, expiração, revogação e limites são código determinístico, sem modelo.
- [x] **IV — IA plugável e barata**: custo de IA adicional **zero** (assinatura de cada provedor do cliente); o servidor não chama nenhum modelo. O desenho é **agnóstico de provedor** (RF-028), o oposto de hardcoded.
- [x] **V — Orçamento da VM**: nada novo na VM; trabalho fora dela (Cloud Run). Impacto declarado acima. **Observação**: "banco externo" — ver _Rastreamento de Complexidade_ (linha 1). A hospedagem em Cloud Run é um segundo alvo — linha 2.
- [x] **VI — pt-BR e BRL**: as ferramentas já respondem em pt-BR/BRL (005). As duas páginas HTML do login/consentimento ficam em **um** módulo de textos em pt-BR (não há React aqui, então `Trans` não se aplica; a regra de lint própria de i18n só varre JSX). Linha 3.
- [x] **VII — Teste para lógica custom**: todo módulo novo tem teste escrito antes (lista na seção _Plano de testes_). Sem novos `any`/`unknown`/`@ts-strict-ignore`/`eslint-disable`; os pontos em que o SDK exige tipos genéricos serão tratados com `zod`/`satisfies` e justificados na tarefa, se surgirem.
- [x] **VIII — Privacidade explícita**: (a) ao Claude/provedor vai só o que VIII-a permite (já garantido pela máscara e pelas ferramentas); (b) log de auditoria sem descrição, valor, e-mail, IP, parâmetros ou token, e **logs de requisição da plataforma excluídos**; (c) segredos só no Secret Manager; o token do Actual **nunca** sai do serviço; (d) lista de terceiros novos a declarar em `infra/README.md`: **Google Cloud (Cloud Run, Artifact Registry, Secret Manager, Cloud Storage, Logging)**, **Google (login OIDC, só e-mail, descartado após validar)** e **cada provedor de IA conectado** (recebe as respostas).

**Resultado da 1ª avaliação (pré-Fase 0)**: PASSOU, com duas pendências a justificar (linhas 1 e 2 abaixo).
**Resultado da 2ª avaliação (pós-Fase 1)**: PASSOU — ver fim do documento.

---

## Segurança — modelo de ameaças resumido

| #   | Ameaça                                                               | Contramedida (onde)                                                                                                                                 | Teste                                                |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A1  | Estranho acha a URL e consulta                                       | Toda rota de dados exige bearer válido; `401` uniforme sem indício de orçamento (RF-004)                                                            | `seguranca.test`: sem token / mal formado / expirado |
| A2  | Token vazado de outro serviço ou de outra audiência                  | `aud` do JWT = URL do `/mcp`; token de outra audiência ⇒ `401` (spec MCP, anti _token passthrough_)                                                 | `tokens.test`                                        |
| A3  | Roubo de refresh token                                               | Rotação a cada uso; **reuso de um já trocado encerra o acesso inteiro**; guardado só em hash                                                        | `acessos.test`: reuso                                |
| A4  | Conta Google válida, mas fora do casal                               | Lista de autorizadas (fonte: secret); fora ⇒ recusa antes de qualquer consentimento; falha fechada se o arquivo for inválido ou tiver > 2           | `autorizadas.test`, `google-callback.test`           |
| A5  | Phishing: cliente malicioso registrado com retorno para domínio dele | Política de redirects (lista + _loopback_); consentimento mostra nome e host de retorno; CSRF; `state`/`nonce` assinados e vinculados               | `client-id.test`, `consentimento.test`               |
| A6  | Roubo/replay de código de autorização                                | PKCE S256 obrigatório; código assinado, 60 s, uso único (em memória), vinculado a cliente + redirect + `resource`                                   | `oauth.test`                                         |
| A7  | Força bruta / abuso de volume                                        | Limites em memória por IP e por acesso (`429`); `max-instances=1`; corpo ≤ 100 kB                                                                   | `limites.test`                                       |
| A8  | Escrita no orçamento                                                 | O servidor só importa leitura (005); todas as ferramentas com `readOnlyHint`; teste que **falha** se uma ferramenta sem esse marcador aparecer      | `somente-leitura.test` (CS-005)                      |
| A9  | PII em resposta ou log                                               | `maskDeep` em toda resposta (005); logger com **lista fechada de campos**; exclusão dos logs de requisição do Cloud Run                             | `auditoria.test`, `mask-pii.test`                    |
| A10 | Perda/roubo do celular                                               | `acessos encerrar`/`encerrar-todos`; remover pessoa do secret; trocar o segredo mestre (invalida tudo)                                              | `acessos.test`, bateria do quickstart                |
| A11 | Comprometimento do ambiente de execução                              | SA mínima (só os secrets e o bucket do serviço), sem shell, imagem enxuta, nenhum segredo em env visível no `describe` (montados do Secret Manager) | Revisão da Terraform; `terraform plan` no PR         |
| A12 | Token do Actual (equivalente a senha, **também escreve** no Actual)  | Só no Secret Manager; nunca em log/resposta; rotação documentada. Risco residual aceito e registrado em `research.md` R-8                           | Inspeção + varredura de segredos (CS-008)            |
| A13 | DNS rebinding / página web de terceiro chamando o `/mcp`             | Sem CORS; `Origin` presente e não permitido ⇒ `403`                                                                                                 | `seguranca.test`                                     |

---

## Estrutura do Projeto

### Documentação desta feature

```
specs/010-acesso-remoto-mcp/
├── spec.md
├── plan.md                   # este arquivo
├── research.md               # Fase 0 — decisões R-1…R-17 e spikes S-1…S-6
├── data-model.md             # Fase 1 — estado, entidades em memória, configuração
├── quickstart.md             # Fase 1 — do zero ao celular + bateria de verificação
├── contracts/
│   ├── oauth-flow.md         # endpoints, parâmetros, erros, política de redirects
│   ├── mcp-endpoint.md       # /mcp, protocolo `instructions`, paridade com a 005
│   ├── cli-acessos.md        # CLI do Pedro: listar / encerrar / encerrar-todos / historico
│   └── auditoria.md          # campos permitidos no log
├── tasks.md                  # /speckit.tasks
└── checklists/requirements.md
```

### Código-fonte

```
packages/custom/
├── Dockerfile.mcp-remoto                 # NOVO — imagem do Cloud Run
└── mcp-financeiro/
    ├── bin/
    │   ├── servidor-remoto.mjs           # NOVO — sobe o serviço HTTP
    │   └── acessos.mjs                   # NOVO — CLI de administração (Mac do Pedro)
    └── src/
        ├── server.ts / source.ts / analysis.ts / mask-pii.ts   # 005 — reaproveitados
        ├── protocol.ts                   # NOVO — definições e protocolo de resposta (fonte única)
        └── remoto/
            ├── config.ts                 # variáveis e secrets; falha fechada
            ├── app.ts                    # composição do Express (rotas, cabeçalhos, limites)
            ├── mcp-http.ts               # POST /mcp stateless + bearer + audiência
            ├── oauth-provider.ts         # provedor do roteador OAuth do SDK
            ├── client-id.ts              # DCR sem estado (documento assinado) + política de redirects
            ├── google-identity.ts        # fluxo OIDC com o Google (code + nonce + state)
            ├── paginas.ts                # HTML pt-BR: consentimento e erros (CSP, CSRF)
            ├── tokens.ts                 # JWT HS256 + HKDF; refresh opaco (hash)
            ├── acessos.ts                # regras: conceder, rotacionar, expirar, encerrar (puro)
            ├── estado-store.ts           # interface + implementação em memória (testes)
            ├── estado-gcs.ts             # GCS por REST com ifGenerationMatch
            ├── autorizadas.ts            # lista de autorizadas (arquivo montado, relido)
            ├── limites.ts                # janela deslizante por IP / por acesso
            ├── origem.ts                 # IP real + filtro de faixa opcional
            ├── auditoria.ts              # logger com lista fechada de campos
            └── *.test.ts                 # um teste por arquivo acima + contrato + segurança
infra/
├── mcp-remoto.tf                         # NOVO — Cloud Run, SA, bucket, secrets, AR, exclusão de logs
└── iam.tf / README.md                    # EDIÇÕES pequenas (papéis; declaração de terceiros)
.github/workflows/
├── deploy-mcp.yml                        # NOVO — CD do serviço (adaptado do smartdata-platform)
└── deploy-gce.yml                        # EDIÇÃO — exclui packages/custom/** do gatilho
```

**Decisão de estrutura**: tudo novo em `packages/custom/` e em arquivos novos de `infra/` e `.github/workflows/`, por causa do princípio II. O código HTTP fica em `remoto/` para que o caminho local (stdio) da `005` **não mude** (RF-003).

### Edições em arquivos existentes (lista fechada)

| Arquivo                                              | Mudança                                                                                    | Natureza                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `packages/custom/mcp-financeiro/src/server.ts` (005) | `instructions` do protocolo; `atualizado_em` nas respostas                                 | Custom, mas arquivo da 005 — **depende do PR #16 mergeado** |
| `packages/custom/mcp-financeiro/src/source.ts` (005) | `refresh()` (sincronizar se > 5 min)                                                       | Idem                                                        |
| `.claude/agents/assistente-financeiro.md` (005)      | nenhuma; um teste compara frases-chave com `protocol.ts`                                   | Teste apenas                                                |
| `infra/iam.tf`                                       | papéis do `tf-deployer` para Cloud Run, Artifact Registry e Secret Manager do serviço novo | Infra (exceção 4 da constituição)                           |
| `infra/README.md`                                    | seção do serviço remoto e declaração de terceiros                                          | Infra                                                       |
| `.github/workflows/deploy-gce.yml`                   | `paths`: excluir `packages/custom/**`                                                      | Infra (arquivo custom do fork)                              |

---

## Plano de testes (princípio VII)

Escritos **antes**, falhando primeiro. Três camadas:

1. **Unitários puros** (sem rede): `acessos` (conceder/expirar/rotacionar/reuso/encerrar/teto), `tokens` (assinatura, `aud`, `exp`, adulteração, HKDF), `client-id` (assinatura, política de redirects: aceita claude/chatgpt/_loopback_ com qualquer porta; recusa host estranho, `http` não-_loopback_, fragmento), `autorizadas` (2 entradas, > 2 ⇒ falha fechada, arquivo ausente/inválido ⇒ recusa tudo, mudança relida), `limites`, `origem` (CIDR, `X-Forwarded-For`), `auditoria` (**só** campos da lista fechada; um teste tenta injetar e-mail/IP/valor e verifica que não sai), `estado-gcs` (conflito de geração ⇒ _retry_), `protocol` (frases-chave iguais às do subagente).
2. **Contrato de ponta a ponta, sem fornecedor**: cliente OAuth+MCP genérico contra o app em memória, com Google simulado: descoberta ⇒ registro ⇒ autorização ⇒ consentimento ⇒ token ⇒ refresh ⇒ `tools/list` ⇒ `tools/call`. Cobre **RF-028**. Inclui as **recusas** da bateria CS-004: sem credencial, token adulterado, expirado, de outra audiência, acesso encerrado, pessoa removida da lista, conta fora da lista, reuso de refresh.
3. **Somente leitura (CS-005/A8)**: o conjunto de ferramentas publicado é igual a uma lista fechada, todas com `readOnlyHint`; a fonte de dados falsa **registra qualquer escrita** e o teste exige zero chamadas após percorrer todas as ferramentas.

Verificação manual guiada (provedores reais, celular, medição da VM, custo): `quickstart.md`.

---

## Fase 0 — Pesquisa → `research.md`

Feita. Decisões R-1 a R-17; fatos F-1 a F-13; spikes S-1 a S-6. Nenhum `NECESSITA ESCLARECIMENTO` restante.

## Fase 1 — Design

- [`data-model.md`](data-model.md): estado persistente, estruturas em memória, configuração e secrets.
- [`contracts/oauth-flow.md`](contracts/oauth-flow.md), [`contracts/mcp-endpoint.md`](contracts/mcp-endpoint.md), [`contracts/cli-acessos.md`](contracts/cli-acessos.md), [`contracts/auditoria.md`](contracts/auditoria.md).
- [`quickstart.md`](quickstart.md): do zero ao celular, bateria de verificação, solução de problemas.

### Reavaliação da Constituição (pós-Fase 1)

- **II**: o design confirmou que nada do upstream é tocado; as únicas edições em arquivos existentes são as da tabela acima (infra do fork e arquivos custom da `005`).
- **V**: o design não adicionou processo na VM. O estado externo ficou limitado a **um objeto** de poucos KB (linha 1 abaixo).
- **VII**: o design acrescentou a camada de contrato e a de somente-leitura; ambas têm teste.
- **VIII**: o design acrescentou a exclusão dos logs de requisição da plataforma e o logger de lista fechada; sem isso, `code=` e IP ficariam no Cloud Logging.
- **Nova dependência de ordem**: o trabalho precisa da `005` **mergeada** (PR #16), porque reaproveita `createFinancasServer`, `BudgetSource` e `maskDeep`.

**Resultado**: PASSOU, com as 3 linhas abaixo justificadas.

---

## Rastreamento de Complexidade

| #   | Violação / ponto de atenção                                                                                         | Por que é necessária                                                                                                                                                                                                           | Por que a alternativa mais simples foi rejeitada                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Estado externo** (princípio V: "NÃO DEVE introduzir banco externo"): um objeto JSON no GCS com a lista de acessos | A História 2 exige **listar e encerrar** acessos individuais, e o Cloud Run não tem disco persistente. O objeto guarda só rótulo, pessoa, datas e hashes (poucos KB); **não é o banco do produto**, que segue SQLite no Actual | _Tudo sem estado_ (JWTs longos): não permite listar nem encerrar um acesso e deixa a revogação lenta. _Firestore_: banco de verdade, viola V. _SQLite na VM_: acopla ao Actual e à VM (R-1). _SQLite no Cloud Run_: some a cada partida a frio |
| 2   | **Segundo alvo de hospedagem** (Identidade da constituição cita só a `e2-micro`): Cloud Run no mesmo projeto        | Atende 24h (decisão do Pedro) com custo ≤ R$ 20 sem consumir RAM da VM. O princípio V manda trabalho que não é o Actual rodar **fora** da VM                                                                                   | _Na VM_: viola V e RF-025. _Mac com túnel_: não é 24h. _Outro PaaS_: terceiro novo fora do GCP. **Ação**: emenda de **correção** à constituição (tabela _Identidade_ / _Hospedagem_) via `/speckit.constitution`, em PR separado               |
| 3   | **Texto de interface fora de `Trans`**: duas páginas HTML (consentimento e erro) renderizadas no servidor           | O fluxo OAuth exige uma página servida pelo próprio servidor de autorização; não há app React nessa rota                                                                                                                       | Passar pelo front do Actual exigiria editar arquivos do upstream (viola II) e expor o front a esse fluxo. Os textos ficam centralizados em `paginas.ts`, em pt-BR, prontos para i18n se um dia houver segundo idioma                           |

---

## Riscos e dependências

| Risco / dependência                                                                     | Mitigação                                                                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **PR #16 (005) ainda aberto**                                                           | A implementação desta feature só começa sobre a `005` mergeada; `/speckit.tasks` marca isso como pré-requisito            |
| Partida a frio lenta (download do orçamento)                                            | OAuth independe do orçamento (R-12); medir; `startup-cpu-boost`; última opção `min-instances=1` com nova decisão de custo |
| Detalhes do SDK 1.32.1 (roteador, `resource`)                                           | Spike S-1 antes de tudo; plano B é implementar só os endpoints faltantes mantendo os testes de contrato                   |
| Provedores mudam seus endereços de retorno                                              | Lista configurável (sem deploy de código); erro de registro explica qual host foi recusado (sem dados)                    |
| O plano de assinatura do Pedro pode não permitir conector customizado em algum provedor | Spike S-2 valida cedo; o requisito CS-012 pede _dois_ clientes, escolhendo o segundo que for viável                       |
| Token do Actual com poder de escrita no Actual                                          | Risco residual aceito (R-8); SA mínima, sem shell, rotação documentada                                                    |
| `infra/README.md` editado por outra sessão                                              | A tarefa de declaração de terceiros é isolada e vem após o merge da `infra-privacidade` (PR #14)                          |
