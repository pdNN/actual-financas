# Modelo de Dados: Acesso remoto e pelo celular

**Sem migração SQL.** O banco do Actual (SQLite) não é tocado. Esta feature tem três tipos de estado, com durações bem diferentes.

| Estado                            | Onde vive                                  | Duração           | Sobrevive a partida a frio? |
| --------------------------------- | ------------------------------------------ | ----------------- | :-------------------------: |
| **Acessos** (quem pode consultar) | Objeto `estado.json` no GCS                | Meses             |             Sim             |
| **Pessoas autorizadas**           | Secret Manager, montado como arquivo       | Até alguém mudar  |             Sim             |
| **Fluxo de login em andamento**   | Cookies/parâmetros **assinados** + memória | 60 s a 10 min     |      Não (e tudo bem)       |
| **Orçamento do Actual (cópia)**   | `/tmp` da instância (memória)              | Vida da instância |             Não             |

---

## 1. Acessos — `estado.json`

```jsonc
{
  "versao": 1,
  // Carimbo de "encerrar tudo": qualquer acesso concedido ANTES disto é inválido.
  "revogadoAntesDe": null, // ISO-8601 ou null
  "acessos": {
    "a_7f3k2m9q": {
      // id aleatório, curto, sem significado
      "rotulo": "celular do Pedro", // escolhido na tela de consentimento
      "pessoa": "pedro", // chave da lista de autorizadas — NUNCA o e-mail
      "cliente": "Claude", // nome informado no registro (só exibição)
      "criadoEm": "2026-10-25T14:03:00Z",
      "ultimoUsoEm": "2026-10-25T18:40:00Z", // gravado no máximo a cada 10 min
      "expiraEm": "2026-11-24T18:40:00Z", // desliza: último uso + 30 dias
      "expiraAbsolutoEm": "2027-04-23T14:03:00Z", // criado + 180 dias; não desliza
      "estado": "ativo", // ativo | encerrado
      "encerradoEm": null,
      "motivoEncerramento": null, // "manual" | "todos" | "reuso-de-refresh" | "pessoa-removida"
      "refreshAtualHash": "sha256:…", // hash do refresh token vigente
      "refreshAnteriorHash": "sha256:…", // o imediatamente anterior, para detectar reuso
    },
  },
}
```

**Regras**

- **Nunca** entram: e-mail, IP, token em claro, conteúdo de consulta, descrição, valor.
- Um acesso é **válido** se: `estado == "ativo"`, `agora < expiraEm`, `agora < expiraAbsolutoEm`, `criadoEm >= revogadoAntesDe` (quando definido) **e** a `pessoa` ainda consta da lista de autorizadas.
- **Teto**: no máximo **10** acessos `ativo` por pessoa. O 11º encerra o mais antigo sem uso (`motivo: "teto"`), em vez de recusar o login legítimo.
- **Limpeza**: acessos `encerrado` ou expirados há > 90 dias saem do objeto na próxima escrita. Tamanho esperado: poucos KB.
- **Escrita**: só pelo caminho de `acessos.ts`, com `ifGenerationMatch`; em conflito relê, reaplica e tenta de novo (até 5 vezes), depois falha com erro distinguível (nunca grava por cima).
- **Leitura**: cache em memória por ≤ 30 s; invalida ao escrever. CLI do Pedro (outro processo) vê a mudança do servidor em ≤ 30 s e vice-versa.
- **Recuperação**: o bucket tem versionamento com ciclo de vida curto (últimas versões por 30 dias). Perder o objeto não vaza nada; só obriga a reautorizar.

### Transições

```
            conceder (consentimento)
   (nada) ───────────────────────────▶ ativo ──┐ renovar (refresh rotativo): desliza expiraEm
                                         │  ▲   │
   encerrar (CLI) / encerrar-todos       │  └───┘
   pessoa removida / reuso de refresh    ▼
   expirar por inatividade ou limite ▶ encerrado   (terminal; nova autorização cria OUTRO acesso)
```

---

## 2. Pessoas autorizadas — secret montado

Arquivo (ex.: `/segredos/pessoas.json`), valor do secret `financas-mcp-pessoas`:

```json
{ "pedro": "email-do-pedro@exemplo.com", "julia": "email-da-julia@exemplo.com" }
```

- Chave = apelido estável (aparece em `acessos[*].pessoa`); valor = e-mail da conta Google (**comparação sem diferenciar maiúsculas**, exige `email_verified: true`).
- Relido a cada ≤ 30 s. **Falha fechada**: arquivo ausente, JSON inválido, vazio ou com mais de 2 entradas ⇒ ninguém entra e a causa vai para o log **sem** o conteúdo.
- Remover uma chave invalida os acessos dela no ato da próxima checagem (RF-017). Esvaziar (`{}`) é o **"encerrar tudo" de emergência** pelo console do GCP.

---

## 3. Estruturas efêmeras (assinadas, sem armazenamento)

| Estrutura                   | Conteúdo                                                                         | Validade                | Proteção                                                                                |
| --------------------------- | -------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| **`client_id`** (DCR)       | `redirect_uris`, nome do cliente, emissão                                        | Sem fim                 | HMAC com subchave "client"; redirects checados contra a política a cada uso             |
| **Estado de login**         | parâmetros originais do `/authorize`, `nonce` do Google, expiração               | 10 min                  | HMAC + cookie `HttpOnly; Secure; SameSite=Lax`, preso ao navegador                      |
| **Sessão de consentimento** | pessoa já validada, parâmetros do pedido, token CSRF                             | 5 min                   | HMAC; CSRF no formulário                                                                |
| **Código de autorização**   | pessoa, rótulo, `client_id`, `redirect_uri`, `code_challenge`, `resource`, `jti` | 60 s                    | HMAC; `jti` de **uso único** guardado em memória até expirar                            |
| **Access token**            | `gid` (id do acesso), `aud` (URL do `/mcp`), `iat`, `exp` (15 min)               | 15 min                  | JWT HS256, subchave "token"; **além disso** o `gid` é conferido no estado a cada pedido |
| **Refresh token**           | 32 bytes aleatórios (base64url)                                                  | até 30 d de inatividade | Só o **hash** vai ao estado; rotação a cada uso                                         |

**Chaves**: um segredo mestre (`financas-mcp-segredo`, ≥ 32 bytes aleatórios) → subchaves por HKDF-SHA256 com rótulos fixos (`client`, `token`, `estado-login`, `consentimento`, `codigo`). Trocar o segredo mestre invalida **tudo** (segundo mecanismo de emergência).

---

## 4. Cópia do orçamento (por instância)

- Aberta em segundo plano na partida; `BudgetSource` da `005`, acrescido de `refresh()` e do instante da última sincronização.
- `refresh()` roda antes de uma consulta se `agora − últimaSync > 5 min` (configurável), serializado (uma sincronização por vez).
- Toda resposta de ferramenta inclui `atualizado_em` (instante da última sincronização).

---

## 5. Configuração do serviço

Variáveis de ambiente (não secretas) e secrets (montados). **Nada disto fica no repositório com valor real**; o Terraform declara nomes e vínculos.

| Nome                                                           | Tipo                  | Para quê                                                                                              |
| -------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| `URL_PUBLICA`                                                  | env                   | URL canônica do serviço (`https://…run.app`); vira `iss` e base do `resource` (`…/mcp`)               |
| `ACTUAL_SERVER_URL`                                            | env                   | URL do Actual de produção                                                                             |
| `ACTUAL_SESSION_TOKEN`                                         | **secret**            | Token de sessão do Actual (equivale a senha)                                                          |
| `ACTUAL_BUDGET_SYNC_ID`                                        | **secret**            | Id do orçamento                                                                                       |
| `ACTUAL_BUDGET_PASSWORD`                                       | **secret** (opcional) | Senha de criptografia do orçamento, se houver                                                         |
| `GOOGLE_CLIENT_ID`                                             | env                   | Cliente OAuth do Google **novo**, dedicado a este serviço                                             |
| `GOOGLE_CLIENT_SECRET`                                         | **secret**            | Segredo do cliente Google                                                                             |
| `financas-mcp-segredo`                                         | **secret**            | Segredo mestre das assinaturas                                                                        |
| `financas-mcp-pessoas`                                         | **secret** (arquivo)  | Lista de autorizadas (§2)                                                                             |
| `BUCKET_ESTADO`                                                | env                   | Nome do bucket do `estado.json`                                                                       |
| `REDIRECTS_PERMITIDOS`                                         | env                   | Política de redirects (padrões `https` aceitos); _loopback_ é sempre aceito. Padrão: Claude e ChatGPT |
| `ORIGENS_PERMITIDAS_CIDR`                                      | env                   | Faixas de IP aceitas em `/mcp`, `/token`, `/register`, `/revoke`. **Vazio = desligado** (padrão)      |
| `TTL_ACCESS_MIN` / `INATIVIDADE_DIAS` / `LIMITE_ABSOLUTO_DIAS` | env                   | 15 / 30 / 180                                                                                         |
| `SYNC_MAX_IDADE_MIN`                                           | env                   | 5                                                                                                     |
| `LIMITE_CONSULTAS_POR_MIN`                                     | env                   | 60 por acesso; `LIMITE_FALHAS_POR_MIN` = 10 por IP                                                    |

`config.ts` valida tudo na partida: **qualquer ausência ou valor inválido ⇒ o serviço sobe recusando todas as rotas de dados** (falha fechada) e loga qual variável falhou, sem valores.
