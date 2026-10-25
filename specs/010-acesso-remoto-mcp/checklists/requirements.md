# Checklist de Qualidade da Especificação: Acesso remoto e pelo celular ao assistente financeiro

**Propósito**: validar completude e qualidade da spec antes de planejar.

## Qualidade do Conteúdo

- [x] Sem detalhes de implementação (linguagens, frameworks, APIs)
- [x] Focada em valor para o usuário e necessidade de negócio
- [x] Escrita para quem não é técnico
- [x] Todas as seções obrigatórias preenchidas

## Completude dos Requisitos

- [ ] Nenhum marcador [NECESSITA ESCLARECIMENTO] pendente
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

- [x] A feature respeita os princípios de .specify/memory/constitution.md
- [x] Violações necessárias estão sinalizadas para justificar no plano

## Notas da validação

- **Marcadores pendentes (3, dentro do orçamento)** — decisões do Pedro; sem elas o
  `/speckit.plan` não consegue escolher hospedagem:
  1. **RF-023** — o assistente precisa responder 24h, ou aceita-se só com o Mac do
     Pedro ligado?
  2. **RF-024** — teto de custo mensal: R$ 0 (só free tier) ou quanto?
  3. **RF-027** — a Julia usa já nesta versão (História 3 entra) ou só o Pedro?
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
