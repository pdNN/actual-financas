# Contrato: log de auditoria

**Princípio VIII**: log de produção não contém descrição de transação, valor nem identificador de usuário. Este contrato é uma **lista fechada**: o logger (`auditoria.ts`) só aceita os campos abaixo; qualquer outro é descartado. Um teste injeta e-mail, IP, valores, parâmetros e tokens e exige que nenhum apareça na saída.

## Formato

Uma linha JSON por evento, em `stdout` (o Cloud Run encaminha ao Cloud Logging):

```json
{
  "ts": "2026-10-25T18:40:12.345Z",
  "servico": "financas-mcp",
  "evento": "consulta",
  "rotulo": "celular do Pedro",
  "ferramenta": "gasto_por_categoria",
  "resultado": "ok",
  "duracao_ms": 412
}
```

| Campo        |           Obrigatório            | Valores                                                                                                                                                                                                   |
| ------------ | :------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts`         |               sim                | ISO-8601 UTC                                                                                                                                                                                              |
| `servico`    |               sim                | fixo `financas-mcp`                                                                                                                                                                                       |
| `evento`     |               sim                | `acesso_concedido` · `acesso_renovado` · `acesso_encerrado` · `acesso_expirado` · `consulta` · `recusado` · `configuracao_invalida` · `estado_conflito`                                                   |
| `rotulo`     |          quando houver           | rótulo do acesso (texto escolhido pelo casal). **Nunca** e-mail ou nome do Google                                                                                                                         |
| `ferramenta` |          em `consulta`           | nome da ferramenta MCP chamada (sem argumentos)                                                                                                                                                           |
| `resultado`  |               sim                | `ok` · `erro` · `negado` · `limitado`                                                                                                                                                                     |
| `motivo`     | em `recusado`/`acesso_encerrado` | `sem-token` · `token-invalido` · `audiencia` · `expirado` · `encerrado` · `pessoa-removida` · `pessoa-nao-autorizada` · `reuso-de-refresh` · `limite` · `manual` · `todos` · `teto` · `redirect-recusado` |
| `duracao_ms` |          em `consulta`           | inteiro                                                                                                                                                                                                   |
| `variavel`   |    em `configuracao_invalida`    | **nome** da variável que falhou — nunca o valor                                                                                                                                                           |

## Nunca

E-mail · IP · `User-Agent` · parâmetros de ferramenta (datas, categorias, filtros) · resultado da ferramenta · descrição, valor, conta · `code`, `state`, tokens, hashes · caminho com _query string_ · conteúdo do estado.

> Observação: o `rotulo` pode conter um primeiro nome ("celular do Pedro"). É um apelido escolhido pelo casal, não um identificador de conta; está dentro do que o princípio VIII permite e é o que torna o histórico útil (História 2, cenário 6).

## Logs da plataforma

O Cloud Run grava por conta própria um **log de requisições** (URL com `code=`/`state=`, IP, agente). Eles são **excluídos** no Cloud Logging por filtro gerenciado no Terraform (`mcp-remoto.tf`), na mesma linha do que o Caddy faz com o access log da VM. O smoke test do deploy verifica a exclusão (consulta que deve voltar vazia).

## Leitura

`acessos historico` (ver `cli-acessos.md`) filtra por `jsonPayload.servico="financas-mcp"`. Retenção: a padrão do Cloud Logging (30 dias), suficiente; sem exportação.
