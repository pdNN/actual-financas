# Quickstart: acesso remoto e pelo celular

Do zero até a primeira pergunta no celular, mais a bateria que prova que a feature está pronta. Tempo-alvo de quem já tem o `gcloud` logado: **menos de 30 min na primeira vez, 10 min para conectar um aparelho novo** (CS-001).

> **Pré-requisitos**: `005` mergeada (PR #16); `gcloud` autenticado como dono do projeto `actual-financas`; Terraform; o **token de sessão do Actual** já no Chaveiro (passo da `005`, `research.md` D-1/Emenda). Segredos **nunca** vão para o repositório, para o chat ou para a linha de comando (use `printf … | gcloud secrets … --data-file=-`).

---

## Parte A — Provisionar (uma vez, pelo Pedro)

### A1. Cliente OAuth do Google (novo, só para este serviço)

1. [Console de credenciais](https://console.cloud.google.com/apis/credentials?project=actual-financas) ▸ **Criar credenciais ▸ ID do cliente OAuth ▸ Aplicativo da Web**.
2. Nome: `financas-mcp`. **URI de redirecionamento autorizado**: `<URL_PUBLICA>/google/callback` (a URL só existe depois do primeiro `terraform apply`; volte aqui e adicione).
3. Na tela de consentimento, confirme que **Pedro e Julia** estão como usuários de teste (já estão, por causa do Actual). Escopos: só `openid` e `email`.
4. Guarde o _client id_ (vai em variável do Terraform) e o _client secret_ (vai ao Secret Manager, A3).

### A2. Terraform

```bash
cd infra
terraform init
terraform plan   # confira: só recursos novos do serviço remoto; nada da VM muda
terraform apply  # primeira vez: à mão, com sua credencial (o CI ainda não tem os papéis)
terraform output url_publica   # anote: é a URL do conector
```

Cria: Cloud Run (`min 0`, `max 1`, 512 MiB, `startup-cpu-boost`), conta de serviço mínima, bucket do estado (privado, versionado), Artifact Registry com limpeza, os _containers_ dos secrets (vazios), exclusão dos logs de requisição, e a conta de serviço de deploy (`mcp-deployer`) no WIF existente. Depois do primeiro apply, os próximos passam pelo PR (esteira do `terraform.yml`).

### A3. Secrets

```bash
printf %s "<client secret do Google>"       | gcloud secrets versions add financas-mcp-google-secret --data-file=-
head -c 48 /dev/urandom | base64            | gcloud secrets versions add financas-mcp-segredo        --data-file=-   # segredo mestre
printf %s '{"pedro":"<email>","julia":"<email>"}' | gcloud secrets versions add financas-mcp-pessoas --data-file=-
# Credenciais do Actual: leia do Chaveiro SEM ecoar na tela
security find-generic-password -s actual-financas -a session-token -w | gcloud secrets versions add financas-mcp-actual-token --data-file=-
printf %s "<sync id>" | gcloud secrets versions add financas-mcp-actual-sync-id --data-file=-
```

(`head … | base64` gera o segredo mestre sem passá-lo por argumento. Se o orçamento tiver senha de criptografia, acrescente `financas-mcp-actual-budget-password`.)

### A4. Primeiro deploy

Merge em `master` com mudança em `packages/custom/**` dispara `deploy-mcp.yml`: constrói a imagem, publica no Artifact Registry, faz `gcloud run deploy` e roda o **smoke test**: `POST /mcp` sem token ⇒ `401` com `WWW-Authenticate`; `/.well-known/oauth-protected-resource` ⇒ `200`; `/saude` ⇒ `200`; consulta de log de requisições ⇒ vazia. Falhou ⇒ volta sozinho à revisão anterior.

---

## Parte B — Conectar um aparelho

### B1. Claude (web ▸ celular)

1. Em **claude.ai ▸ Configurações ▸ Conectores ▸ Adicionar conector personalizado**: nome `Finanças`, URL `<URL_PUBLICA>/mcp`. **Não** há campo de chave nem de _client id_ — deixe em branco.
2. **Conectar**: abre o login do Google ▸ escolha a conta ▸ tela do serviço: confirme que o endereço de retorno é `claude.ai`, dê o **rótulo** ("celular do Pedro") ▸ **Autorizar**.
3. No **app do Claude no celular**, abra uma conversa, habilite o conector **Finanças** e pergunte: _"quanto gastamos por categoria em setembro?"_.
4. Cronometre: seguir os passos 1–3 com o serviço implantado deve levar < 10 min e **nenhum segredo digitado ou colado** (CS-001).

> **Spike S-2**: se o app do celular não listar o conector cadastrado na web, ou exigir o cadastro no próprio aparelho, anote aqui o caminho real e ajuste este passo.

### B2. Julia

Mesmos passos, na conta dela, com o rótulo "celular da Julia" (História 3). O e-mail dela precisa estar em `financas-mcp-pessoas`.

### B3. Segundo provedor (CS-012)

Escolha **um** que o plano de vocês permita e repita B1 com a mesma URL:

- **ChatGPT** (modo desenvolvedor ▸ conector personalizado): URL `<URL_PUBLICA>/mcp`, autenticação OAuth. O endereço de retorno mostrado por ele (`chatgpt.com/connector/oauth/…`) já está na lista padrão; se o ChatGPT mostrar outro formato, o registro será recusado com o host no erro ⇒ acrescente a linha em `REDIRECTS_PERMITIDOS` (variável do Terraform) e aplique.
- **Gemini CLI / Cursor / Claude Code** (cliente de linha de comando ou IDE): adicione o servidor `http` com a URL; o login abre no navegador (retorno em `localhost`, aceito automaticamente).

Faça a mesma pergunta de gasto e confira o resultado contra o do Mac (CS-003).

---

## Parte C — Bateria de verificação (critérios de sucesso)

Marque cada item com a evidência (saída ou captura **sem dados financeiros**).

| #   | Verificação                                                                                                                                                                                                                         | Critério |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| C1  | Mesma pergunta de gasto por categoria no **Mac (Claude Code, stdio)** e no **celular**: totais iguais ao centavo; mesma definição de sobra                                                                                          | CS-003   |
| C2  | `curl -si -X POST <URL>/mcp -d '{}'` ⇒ `401` + `WWW-Authenticate`; sem nenhum dado. Repita com token inventado, token vencido, token de outro serviço, `Authorization` mal formado: sempre `401` igual                              | CS-004   |
| C3  | Tente autorizar com uma conta Google **que não está** em `financas-mcp-pessoas`: página de erro genérica, nenhum acesso criado (`acessos listar` não muda)                                                                          | CS-004   |
| C4  | `acessos listar` mostra o aparelho; `acessos encerrar "<rótulo>"`; a próxima pergunta no aparelho falha em ≤ 5 min (esperado ≈ 1 min) e os outros aparelhos continuam                                                               | CS-005   |
| C5  | `acessos encerrar-todos`: todos os aparelhos falham em ≤ 5 min **sem tocar no celular**. Reautorize um aparelho: volta a funcionar                                                                                                  | CS-006   |
| C6  | Emergência sem Mac: no console do GCP, nova versão de `financas-mcp-pessoas` com `{}` ⇒ todos falham em ≤ 1 min; restaure a versão anterior                                                                                         | CS-006   |
| C7  | Remover só a Julia do secret: acessos dela caem; os do Pedro seguem                                                                                                                                                                 | RF-017   |
| C8  | Peça pelo celular "categorize essas transações para mim": recusa explicando que só lê. Antes e depois da sessão, exporte contagem de transações/categorias/regras no Actual e compare: iguais                                       | CS-007   |
| C9  | Pergunte por uma descrição contendo CPF/cartão de teste (crie uma transação de teste no Actual, depois apague): a resposta traz `[CPF]`/`[CARTAO]`                                                                                  | CS-009   |
| C10 | Varredura de segredos no repositório e na imagem (`gitleaks` ou equivalente) e `gcloud run services describe`: nenhum valor secreto. `acessos historico` e uma busca no Cloud Logging por trecho de descrição/valor/e-mail/IP: nada | CS-008   |
| C11 | Deixe o serviço ocioso > 20 min (escala a zero) e pergunte do celular: primeira resposta em < 30 s. Registre o tempo                                                                                                                | CS-002   |
| C12 | Durante C11 e uma sessão de perguntas, observe a VM do Actual (CPU/memória no console, `docker stats` via IAP): sem salto relevante; o Actual segue responsivo para quem o usa                                                      | CS-010   |
| C13 | Fatura/Billing do projeto após 1 semana de uso real: custo adicional ≤ R$ 20 (esperado ≪)                                                                                                                                           | CS-011   |
| C14 | Esgote o limite de consultas (script com > 60 pedidos/min por um acesso): `429` com `Retry-After`; o Actual não sente                                                                                                               | RF-019   |
| C15 | Pare o Actual (ou use token inválido em ambiente de teste): a resposta distingue "Actual fora do ar" de "acesso encerrado"                                                                                                          | RF-022   |

---

## Parte D — Operação

| Tarefa                              | Como                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Ver acessos / histórico             | `acessos listar`, `acessos historico --dias 7` (`contracts/cli-acessos.md`)                                                                  |
| Aparelho perdido                    | `acessos encerrar "<rótulo>"` (ou `encerrar-todos`); sem Mac, ver "Emergência" em `cli-acessos.md`                                           |
| Renovar o token do Actual           | Gere outro token (passo da `005`), `gcloud secrets versions add financas-mcp-actual-token`, novo deploy/revisão. Ninguém precisa reautorizar |
| Rotacionar o segredo mestre         | Nova versão de `financas-mcp-segredo` + nova revisão. **Invalida todos os acessos**: cada aparelho reautoriza (1 login)                      |
| Acrescentar um provedor de IA       | Linha nova em `REDIRECTS_PERMITIDOS` (Terraform) e `apply`. Sem mudança de código                                                            |
| Trocar a URL (ex.: domínio próprio) | Muda `URL_PUBLICA`, o redirect do Google e o conector em cada aparelho; todos reautorizam                                                    |
| Atualizar o serviço                 | PR ▸ merge ▸ `deploy-mcp.yml`. Rollback: Cloud Run ▸ revisões ▸ enviar tráfego à anterior                                                    |

## Parte E — Solução de problemas

| Sintoma                                               | Causa provável                                                                                                       | O que fazer                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "Couldn't reach the MCP server" ao adicionar          | `401` sem `WWW-Authenticate`; URL digitada diferente do `resource`; filtro de origem ligado e provedor fora da faixa | `curl -si` no `/mcp` e no `/.well-known/oauth-protected-resource`; conferir `URL_PUBLICA`; esvaziar `ORIGENS_PERMITIDAS_CIDR` |
| Registro recusado (`invalid_redirect_uri`)            | Provedor com endereço de retorno fora da lista                                                                       | Acrescentar o padrão em `REDIRECTS_PERMITIDOS`                                                                                |
| Login Google diz "acesso bloqueado"                   | Conta fora dos usuários de teste do cliente OAuth                                                                    | Acrescentar o usuário na tela de consentimento do Google                                                                      |
| "Esta conta não tem acesso" após o login              | E-mail não está (ou está escrito diferente) em `financas-mcp-pessoas`; arquivo inválido                              | Corrigir o secret; olhar `configuracao_invalida` no log                                                                       |
| Conector pede para reconectar                         | Acesso expirou (30 dias sem uso) ou foi encerrado                                                                    | Reconectar (um login). `acessos listar` mostra o estado                                                                       |
| Primeira pergunta demora ou dá "orçamento carregando" | Partida a frio                                                                                                       | Repetir em instantes; se recorrente, medir (C11) e reavaliar `min-instances`                                                  |
| Tudo falha com "perdeu o acesso ao Actual"            | Token do Actual inválido/rotacionado                                                                                 | Renovar o token (Parte D)                                                                                                     |
