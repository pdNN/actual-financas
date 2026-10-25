# Contrato: CLI de administração de acessos

Roda **só na máquina do Pedro**, autenticado por `gcloud` (IAM do GCP decide quem pode). **Não existe endpoint administrativo na internet** (research R-14). Não precisa do aparelho que se quer bloquear (RF-016).

```bash
yarn workspace @actual-financas/custom acessos <comando> [opções]
```

Pré-requisito: `gcloud auth login` com permissão de leitura/escrita no objeto `estado.json` e de leitura de logs do serviço. Nome do bucket e do serviço vêm de `FINANCAS_MCP_BUCKET` / `FINANCAS_MCP_PROJETO` (ou do `gcloud config`); nenhum segredo é pedido nem impresso.

| Comando                           | O que faz                                                                                                                                        | Saída                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `acessos listar`                  | Lista os acessos ativos e recentes                                                                                                               | Tabela: `id`, `rótulo`, `pessoa`, `cliente`, `criado`, `último uso`, `expira`, `estado`      |
| `acessos encerrar <id \| rótulo>` | Encerra **um** acesso (`motivo: manual`). Rótulo ambíguo ⇒ lista os candidatos e **não** faz nada; pede o `id`                                   | "Encerrado: celular do Pedro (a_7f3k2m9q). Vale na próxima consulta, em até ~1 min."         |
| `acessos encerrar-todos`          | Define `revogadoAntesDe = agora` e marca todos como encerrados (`motivo: todos`). Pede confirmação digitando `ENCERRAR`; `--sim` pula a pergunta | "N acessos encerrados. Ninguém consulta até nova autorização."                               |
| `acessos pessoa-remover <pessoa>` | Encerra todos os acessos da pessoa (`pessoa-removida`). **Não** edita a lista de autorizadas (isso é o secret)                                   | Idem, e lembra de remover a chave do secret `financas-mcp-pessoas`                           |
| `acessos historico [--dias N]`    | Lê do Cloud Logging os eventos de auditoria (padrão: 7 dias): concessão, renovação, encerramento, consultas, recusas                             | Linhas: `data/hora · evento · rótulo · ferramenta · resultado` — **sem** conteúdo ou valores |

## Garantias

- Escreve o estado com `ifGenerationMatch` (mesmo protocolo do servidor); em conflito relê e repete. Nunca sobrescreve às cegas.
- Imprime **só** o que está em `data-model.md §1` (nunca e-mail, token, hash).
- Códigos de saída: `0` ok; `1` erro de uso; `2` sem permissão/sem rede (mensagem diz o que checar, sem vazar IDs); `3` ambiguidade.
- Implementação em `acessos.ts` (regras puras, as mesmas do servidor) + `bin/acessos.mjs` (fina: argumentos, token do `gcloud`, saída). Teste cobre as regras e a formatação; o `bin` é fino.

## Emergência sem Mac (qualquer navegador ou o app do GCP)

| Quero…                                                                            | Faço…                                                                                                                                                                                                  | Vale em…                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Bloquear **todo mundo** agora                                                     | Console do GCP ▸ Secret Manager ▸ `financas-mcp-pessoas` ▸ nova versão com `{}`                                                                                                                        | ≤ 1 min                  |
| Bloquear **uma pessoa**                                                           | Mesma tela, nova versão sem a chave dela                                                                                                                                                               | ≤ 1 min                  |
| Invalidar **tudo**, até tokens já emitidos, mesmo se o estado estiver inacessível | Secret Manager ▸ `financas-mcp-segredo` ▸ nova versão (qualquer valor novo de ≥ 32 bytes) e desativar a anterior ▸ reiniciar a revisão (novo deploy ou "editar e implantar nova revisão" no Cloud Run) | Na nova revisão (~1 min) |
| Desligar o serviço                                                                | Console ▸ Cloud Run ▸ serviço ▸ desativar acesso público (remover `allUsers`)                                                                                                                          | Imediato                 |
