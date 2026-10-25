# Checklist de Qualidade da Especificação: Acesso remoto e pelo celular ao assistente financeiro

**Propósito**: validar completude e qualidade da spec antes de planejar.

## Qualidade do Conteúdo

- [x] Sem detalhes de implementação (linguagens, frameworks, APIs)
- [x] Focada em valor para o usuário e necessidade de negócio
- [x] Escrita para quem não é técnico
- [x] Todas as seções obrigatórias preenchidas

## Completude dos Requisitos

- [x] Nenhum marcador [NECESSITA ESCLARECIMENTO] pendente
- [x] Requisitos são testáveis e não-ambíguos
- [x] Critérios de sucesso são mensuráveis
- [x] Critérios de sucesso são agnósticos de tecnologia
- [x] Todos os cenários de aceitação estão definidos
- [x] Casos de borda identificados
- [x] Escopo claramente delimitado
- [x] Dependências e premissas identificadas

## Prontidão da Feature

- [x] Todo requisito funcional tem critério de aceitação claro
- [x] As histórias cobrem os fluxos principais
- [x] A feature atende aos critérios de sucesso definidos
- [x] Nenhum detalhe de implementação vazou para a especificação

## Conformidade com a Constituição

- [x] A feature respeita os princípios de .specify/memory/constitution.md _(com a emenda 2.0.0 ao III, PR #17 — reconferir após o merge)_
- [x] Violações necessárias estão sinalizadas para justificar no plano

## Notas da validação

- **Marcadores**: os 3 foram respondidos pelo Pedro em 2026-10-25 e registrados em
  _Clarificações_ na spec: 24h (RF-023), teto de R$ 20/mês (RF-024), Julia já
  nesta versão (RF-027). Nenhum pendente.
- **Ampliação 2 (2026-10-25)**: escrita total pelo MCP (RF-029 a RF-037, CS-013 a CS-016, História 4). Decisões do Pedro: sem travas no servidor, IA avalia o risco, Pedro e Julia escrevem, **emendar o princípio III**. A emenda ao III foi simplificada a pedido dele (PR #17); o item de conformidade fica marcado **condicionado** ao merge dela.
- **Ampliação de escopo (2026-10-25)**: pedido do Pedro de funcionar em qualquer
  provedor de IA → RF-028 e CS-012; o item sobre outros clientes saiu de
  "bônus" e passou a requisito.
- **Menções técnicas deliberadas**: "Chaveiro", "token de sessão", "login Google" e
  "OAuth" aparecem apenas em _Contexto_ e _Premissas_, como fatos herdados da `005`
  (Emenda D-1) e como restrição do cliente Claude para conectores remotos — não
  como prescrição de solução. A escolha de hospedagem e de mecanismo fica para o plano.
- **Tensão com a constituição resolvida na spec**: o princípio VIII proíbe
  identificador de usuário em log; o registro de acesso (RF-020) usa **rótulo** do
  acesso (ex.: "celular do Pedro"), não e-mail. O plano deve manter isso.
- **Itens que o plano precisa tratar**: impacto de memória/disco na VM (V), terceiro
  novo em `infra/README.md` (VIII), código só em diretório custom (II), bateria de
  autorização como teste automatizado (VII).
