# Contrato: fluxo de autorização (OAuth 2.1)

O serviço é **recurso** e **servidor de autorização** ao mesmo tempo. Todos os endereços abaixo são relativos a `URL_PUBLICA`. Tudo em HTTPS. Padrões seguidos: MCP Authorization (rev. 2025-06-18), OAuth 2.1 (rascunho 13), RFC 9728, RFC 8414, RFC 7591, RFC 8707, RFC 7636, RFC 8252.

## Linha do tempo (o que o cliente de IA faz sozinho)

```
cliente MCP            serviço (/mcp + OAuth)                navegador do usuário          Google
   │ POST /mcp (sem token)  │                                        │                       │
   │◀── 401 + WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"
   │ GET /.well-known/oauth-protected-resource  ──▶  { resource, authorization_servers:[URL_PUBLICA] }
   │ GET /.well-known/oauth-authorization-server ──▶ { endpoints, S256, DCR, … }
   │ POST /register (JSON)  ──▶  { client_id (assinado), redirect_uris, … }
   │ abre navegador ──────────────────────────────▶ GET /authorize?…&code_challenge=…&resource=…
   │                                                  │── 302 ───────────────────────────────▶ login Google
   │                                                  │◀── 302 /google/callback?code&state ───┘
   │                                                  │  valida id_token + lista de autorizadas
   │                                                  │  mostra /consentimento (rótulo + "Autorizar leitura")
   │◀──────────────── 302 redirect_uri?code=…&state=… ┘
   │ POST /token (code + code_verifier + resource)  ──▶ { access_token, refresh_token, expires_in }
   │ POST /mcp (Authorization: Bearer …) ──▶ resultado MCP
```

## Endpoints

| Método e caminho                              | Quem chama                  | Autenticação              | Resposta de sucesso                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | --------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /.well-known/oauth-protected-resource`   | cliente                     | nenhuma                   | `200` JSON: `resource` = `URL_PUBLICA/mcp` (**igual ao que o usuário digita**), `authorization_servers` = `[URL_PUBLICA]` (**um só item**), `bearer_methods_supported: ["header"]`, `scopes_supported: ["financas:ler"]`                                                                                                                                                                                                                 |
| `GET /.well-known/oauth-authorization-server` | cliente                     | nenhuma                   | `200` JSON: `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `revocation_endpoint`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `scopes_supported: ["financas:ler"]`. **Não** anuncia `client_id_metadata_document_supported` (sem CIMD na v1) |
| `POST /register`                              | cliente                     | nenhuma                   | `201` JSON (RFC 7591) com `client_id` assinado; `token_endpoint_auth_method: "none"`                                                                                                                                                                                                                                                                                                                                                     |
| `GET /authorize`                              | navegador                   | nenhuma (inicia login)    | `302` para o Google                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GET /google/callback`                        | navegador (vindo do Google) | `state` assinado + cookie | `200` HTML do consentimento, ou página de erro                                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /consentimento`                         | navegador                   | CSRF + sessão assinada    | `302` para o `redirect_uri` do cliente com `code` e `state`                                                                                                                                                                                                                                                                                                                                                                              |
| `POST /token`                                 | cliente                     | PKCE (cliente público)    | `200` JSON `{access_token, token_type:"Bearer", expires_in:900, refresh_token, scope}`                                                                                                                                                                                                                                                                                                                                                   |
| `POST /revoke`                                | cliente                     | token a revogar           | `200` vazio (RFC 7009)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /mcp`                                   | cliente                     | `Authorization: Bearer`   | ver `mcp-endpoint.md`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GET /saude`                                  | smoke test / Cloud Run      | nenhuma                   | `200 {"ok":true}` — **não** toca o Actual nem o estado                                                                                                                                                                                                                                                                                                                                                                                   |

`/token` aceita `application/x-www-form-urlencoded` (exigência do Claude); `/register` aceita `application/json`. Corpo máximo 100 kB. **Sem CORS.**

## Regras de validação

### `POST /register`

- Cada item de `redirect_uris` precisa casar com a **política de redirects**:
  1. `https` + host e caminho presentes em `REDIRECTS_PERMITIDOS`. Padrão: `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`, `https://chatgpt.com/connector/oauth/*`, `https://chatgpt.com/connector_platform_oauth_redirect`. `*` casa **um** segmento de caminho; nunca o host.
  2. _loopback_ (`http://localhost`, `http://127.0.0.1`, `http://[::1]`) com **qualquer porta** e caminho livre (RFC 8252 §7.3).
  3. Nada mais. Sem fragmento. Sem `javascript:`/esquemas personalizados.
- Qualquer item inválido ⇒ `400` `{"error":"invalid_redirect_uri","error_description":"<host recusado>"}` (descrição sem dados).
- `client_name` é só exibição (truncado a 60 caracteres, escapado no HTML).
- `token_endpoint_auth_method` diferente de `none` ⇒ `400 invalid_client_metadata`.

### `GET /authorize`

- Exige `response_type=code`, `client_id` (assinatura válida), `redirect_uri` **idêntico** a um registrado, `code_challenge` com `code_challenge_method=S256`, `state` (repassado intacto). `resource`, quando presente, **deve** ser `URL_PUBLICA/mcp`; ausente é aceito (compatibilidade), mas o token emitido sempre leva essa audiência.
- Erro **antes** de validar `redirect_uri`/`client_id` ⇒ página de erro própria (nunca redireciona para um retorno não verificado). Depois disso ⇒ redirecionamento de erro padrão (`error=…`).
- Escopo pedido diferente de `financas:ler` (ou vazio) ⇒ concede `financas:ler`; qualquer outro ⇒ `invalid_scope`.

### `GET /google/callback`

Exige, **todos**: `state` válido e não expirado; cookie de login coincidente; troca do `code` no endpoint do Google por TLS com o segredo do cliente; `id_token` com `iss` Google, `aud` = `GOOGLE_CLIENT_ID`, `exp` válido, `nonce` igual ao do estado, `email_verified: true`; e-mail presente na **lista de autorizadas**. Falhou qualquer um ⇒ página de erro genérica ("Esta conta não tem acesso.") — **sem** dizer qual critério falhou nem revelar a lista. Tokens do Google são **descartados** logo após a validação; o e-mail **não é gravado nem logado** (só a chave `pessoa` segue adiante).

### `POST /consentimento`

- A página mostra: nome do cliente, **host do retorno** em destaque, o que será concedido ("consultar — **somente leitura** — as finanças do casal"), campo **rótulo do acesso** (obrigatório, 1–40 caracteres, sugestão "celular de <pessoa>") e o botão "Autorizar".
- CSRF obrigatório; sessão assinada de 5 min; página com `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'`, `frame-ancestors 'none'`.
- Sucesso: gera código de autorização (60 s, uso único) e redireciona.

### `POST /token`

| `grant_type`         | Exige                                                                                                                                    | Resultado                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authorization_code` | `code`, `code_verifier` (confere o `code_challenge`), `client_id`, `redirect_uri` idêntico, `resource` (se enviado, = `URL_PUBLICA/mcp`) | Cria o **acesso** (rótulo, pessoa), devolve `access_token` (15 min) e `refresh_token`                                                                                                                                 |
| `refresh_token`      | `refresh_token`, `client_id`                                                                                                             | Se o hash == `refreshAtualHash`: gira (novo refresh, antigo vira `refreshAnteriorHash`), desliza `expiraEm`. Se == `refreshAnteriorHash` (**reuso**): encerra o acesso (`reuso-de-refresh`) e devolve `invalid_grant` |

Erros RFC 6749: `invalid_request`, `invalid_client`, `invalid_grant` (código usado/expirado, PKCE errado, refresh inválido/expirado/acesso encerrado), `unsupported_grant_type`, `invalid_scope`. **`invalid_grant`** — nunca outro código — quando o refresh deixa de valer (o Claude depende disso).

### Resposta `401` do `/mcp`

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="<URL_PUBLICA>/.well-known/oauth-protected-resource", scope="financas:ler"
Content-Type: application/json
{"error":"unauthorized"}
```

Idêntica para: sem cabeçalho, token malformado, assinatura inválida, expirado, audiência errada, acesso encerrado/expirado, pessoa removida. **Não** distingue — quem está de fora não aprende nada. A distinção para o **usuário autorizado** (RF-022) vem no `/token`: o `invalid_grant` de um refresh que deixou de valer traz `error_description` = `acesso expirado` ou `acesso encerrado` (só quem tem um refresh de verdade chega a esse ponto), e o log registra o motivo.

## Limites

| Escopo                | Limite padrão                 | Resposta              |
| --------------------- | ----------------------------- | --------------------- |
| Falhas de auth por IP | 10/min                        | `429` + `Retry-After` |
| `/register` por IP    | 10/min                        | `429`                 |
| `/authorize` por IP   | 30/min                        | `429`                 |
| Consultas por acesso  | 60/min                        | `429` + `Retry-After` |
| Pedidos simultâneos   | 8 (concorrência do Cloud Run) | fila do Cloud Run     |

O IP vem do cabeçalho `X-Forwarded-For` (posição confiável a confirmar no spike S-4), é usado **só em memória** e nunca vai a log.

## Cabeçalhos de toda resposta

`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` (rotas de OAuth e `/mcp`).
