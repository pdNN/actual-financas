# Especificação: actual-financas — o produto

**Branch**: `master` (documento vivo, não é uma feature)
**Criada em**: 2026-08-09
**Status**: Ativa
**Número**: `000` — reservado. Features começam em `001`.

> Esta é a **spec-mãe**. Ela descreve o que o sistema é, para quem, e o que
> conta como sucesso. Specs de feature (`specs/001-*`, `002-*`, …) herdam este
> contexto e não precisam repeti-lo.
>
> As regras de como construir estão em `.specify/memory/constitution.md`.

---

## Contexto

**actual-financas** é um fork de
[actualbudget/actual](https://github.com/actualbudget/actual) (base v26.3.0),
customizado para o uso do **Pedro e da Julia**, um casal, para organizar as
contas em conjunto.

O Actual Budget resolve muito bem o orçamento de envelope, importação de OFX/CSV,
regras de categorização e sincronização. Este fork **não reescreve nada disso**.
Ele adiciona o que falta para o contexto brasileiro e para este casal
especificamente: classificação assistida por IA, vocabulário de extrato
brasileiro, e menos atrito para registrar despesa no dia a dia.

**Hospedagem atual**: uma VM `e2-micro` (free tier) no GCP, projeto
`actual-financas`, com SQLite em disco local, Caddy com TLS automático e backup
para bucket GCS. Deploy por GitHub Actions. Runbook em `infra/README.md`.

---

## O problema

**As receitas foram cadastradas. As despesas nunca.**

O sistema está no ar e configurado, mas não está sendo usado de verdade. Não
falta funcionalidade — falta o registro acontecer. Cada despesa exige que alguém
lembre, abra o sistema, escolha conta, valor, data e categoria. Isso não sobrevive
à rotina.

Consequência: sem despesas, não existe orçamento, não existe projeção, não existe
resposta para "onde está o dinheiro" nem para "quanto falta para investir". Todo
o resto do produto depende de resolver isto primeiro.

**Portanto**: toda feature deste repositório é julgada primeiro por quanto ela
reduz o atrito de registrar despesa. Uma feature que não reduz esse atrito, e
não depende de algo que reduza, é candidata a ser adiada.

---

## Cenários de Usuário e Testes

### História 1 — Registrar despesas sem atrito (Prioridade: P1) 🎯 MVP

Como casal, queremos que as despesas do mês entrem no sistema com esforço
próximo de zero, para que o orçamento reflita a realidade sem depender de
disciplina diária.

**Por que essa prioridade**: é o problema central. Sem isso, nada mais do
produto funciona. Todas as outras histórias assumem que existem despesas
cadastradas.

**Teste independente**: ao fim de um mês, as despesas daquele mês estão no
sistema, e ninguém precisou lembrar de digitar transação manualmente todo dia.

**Cenários de aceitação**:

1. **Dado** que recebi a fatura do cartão do mês, **Quando** eu importo o arquivo,
   **Então** todas as transações entram sem duplicar as que já existiam.
2. **Dado** que acabei de gastar em um lugar, **Quando** registro no celular,
   **Então** a despesa é criada em menos de 15 segundos, com conta e categoria já sugeridas.
3. **Dado** que uma transação já foi importada antes, **Quando** ela aparece de
   novo em outro arquivo, **Então** o sistema a reconhece e não duplica.

**Abordagens** — reavaliadas em 2026-08-10 depois de analisar faturas reais do
Itaú e o código da integração Pluggy. A leitura anterior estava errada em dois
pontos, corrigidos aqui:

| Abordagem                                   | A favor                                                                                                                                                                 | Contra                                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sync automático** (Pluggy / Open Finance) | Atrito zero; **grátis** para uso pessoal (Meu Pluggy, sem prazo); `app-pluggyai` do upstream já corrige data de parcela e sinal de cartão, e traz nome de lojista limpo | Integração marcada como experimental no Actual; consentimento vence e precisa ser renovado; histórico inicial costuma ser limitado                                 |
| **Lançamento rápido no celular**            | Menor atrito diário; captura dinheiro e Pix, que não aparecem em fatura                                                                                                 | Depende de hábito; precisa de UI muito boa no mobile                                                                                                               |
| **Import de fatura/extrato** (XLSX/OFX/CSV) | Sem dependência externa; útil para carga histórica que o Open Finance não devolve                                                                                       | Ritual mensal; **a planilha do Itaú traz a data da compra, não a da cobrança**, o que joga parcela antiga em mês fechado; descrição suja atrapalha a classificação |

**Duas correções em relação à versão anterior desta spec:**

1. Dizia que o sync automático tinha "custo mensal do Pluggy". **É falso para
   este caso**: o _Meu Pluggy_ é gratuito por tempo indeterminado para uso
   pessoal; os planos a partir de R$ 2.500/mês valem para uso comercial.
2. Tratava o import de fatura como o caminho mais simples. Analisando os
   arquivos reais, ele é o **mais difícil de fazer certo** — data de parcela,
   deduplicação de parcelas consecutivas e formato numérico ambíguo são
   problemas que o Pluggy já resolve.

Por isso a ordem inverteu: **sync automático primeiro**, lançamento rápido para
o que não passa no cartão, e import de arquivo reduzido ao papel de carga
histórica.

---

### História 2 — Classificação confiável e barata (Prioridade: P2)

Como quem opera o sistema, quero que as transações cheguem já categorizadas
corretamente, sem que isso gere custo relevante de IA nem trabalho de revisão
repetitivo.

**Por que essa prioridade**: transação importada mas não categorizada não vira
orçamento. É o segundo gargalo depois do registro. Fica em P2 porque depende da
História 1 ter produzido dados.

**Teste independente**: importar um lote de transações e verificar quantas saíram
com a categoria certa sem intervenção, e quantas exigiram chamada a modelo de IA.

**Cenários de aceitação**:

1. **Dado** um lote importado, **Quando** a classificação roda, **Então** as
   transações cuja descrição já é conhecida são categorizadas por regra
   determinística, sem chamar modelo de IA.
2. **Dado** uma transação com descrição inédita, **Quando** a IA sugere categoria,
   **Então** a sugestão aparece para revisão com a confiança visível, e não é
   gravada automaticamente abaixo do limiar configurado.
3. **Dado** que confirmei a categoria de uma descrição nova, **Quando** a mesma
   descrição aparecer de novo, **Então** ela é resolvida sem chamar a IA.
4. **Dado** um mês inteiro de uso, **Quando** eu observo a métrica de acionamento,
   **Então** a proporção de transações que chegam até a IA caiu em relação ao mês anterior.

---

### História 3 — Enxergar a situação do casal (Prioridade: P3)

Como casal, queremos entender onde o dinheiro está, o que já está comprometido e
quanto sobra para investir.

**Por que essa prioridade**: é o valor final do produto, mas só faz sentido sobre
dados completos. Antecipar isso produz relatório bonito de dado incompleto.

**Teste independente**: com um mês fechado de dados reais, o sistema responde
"quanto gastamos por categoria", "quanto ainda vai cair de parcelas" e "quanto
sobrou".

**Cenários de aceitação**:

1. **Dado** uma transferência entre contas nossas, **Quando** ela é importada,
   **Então** é identificada como transferência e não conta como despesa.
2. **Dado** uma compra parcelada, **Quando** ela é registrada, **Então** as
   parcelas futuras ficam visíveis como compromisso.
3. **Dado** um mês fechado, **Quando** peço o resumo, **Então** vejo gasto por
   categoria, comparação com o mês anterior e o quanto sobrou.

---

### Casos de Borda

- Arquivo de fatura em formato inesperado, ou com codificação quebrada.
- Transação importada duas vezes por arquivos que se sobrepõem.
- Estorno e chargeback: valor negativo em conta de cartão.
- Compra em moeda estrangeira, com conversão e IOF em linhas separadas.
- Provider de IA indisponível, com cota estourada, ou retornando JSON inválido.
- Pix entre o Pedro e a Julia — transferência interna do casal, não despesa.
- Categoria removida ou renomeada depois de já ter sido usada por uma regra.

---

## Requisitos

### Requisitos Funcionais

- **RF-001**: Sistema DEVE permitir importar extrato e fatura em OFX e CSV sem
  duplicar transações já existentes.
- **RF-002**: Sistema DEVE permitir registrar uma despesa avulsa pelo celular, com
  conta, valor, data e categoria.
- **RF-003**: Sistema DEVE classificar transações tentando, nesta ordem: regras
  nativas do Actual, cache de descrição normalizada e, só então, IA.
- **RF-004**: Sistema DEVE apresentar a sugestão de categoria da IA junto com a
  confiança, e NÃO DEVE gravá-la automaticamente abaixo do limiar configurado.
- **RF-005**: Sistema DEVE converter categorizações confirmadas em regra nativa ou
  entrada de cache, de modo que a mesma descrição não volte ao modelo.
- **RF-006**: Sistema DEVE expor a proporção de transações que chegaram até a IA e
  o custo estimado do lote.
- **RF-007**: Sistema DEVE permitir trocar o provider de IA por configuração, sem
  alteração de código.
- **RF-008**: Sistema DEVE identificar transferências entre contas do casal e
  NÃO DEVE contabilizá-las como despesa ou receita.
- **RF-009**: Sistema DEVE registrar compras parceladas de forma que as parcelas
  futuras sejam visíveis como compromisso.
- **RF-010**: Sistema DEVE produzir um resumo mensal com gasto por categoria e
  comparação com o mês anterior.
- **RF-011**: Sistema NÃO DEVE enviar número de conta, número de cartão, CPF,
  credencial ou senha para qualquer provider externo de IA.
- **RF-012**: Sistema DEVE apresentar toda a interface em português do Brasil, com
  valores em BRL.

### Entidades-Chave

Mapeadas ao schema real — `packages/loot-core/src/server/sql/init.sql` e
`packages/loot-core/migrations/`.

- **Transação** (`transactions`): conta, valor, data, descrição (payee),
  descrição importada, categoria, notas, identificador financeiro, vínculo de
  transferência, relação pai/filho para transação dividida.
- **Categoria** (`categories`) e **Grupo de Categoria** (`category_groups`):
  a estrutura do orçamento; distingue receita de despesa.
- **Payee** (`payees`): o estabelecimento. Carrega a flag `learn_categories`, que
  liga o aprendizado automático de categoria.
- **Regra** (`rules`): condições e ações que categorizam automaticamente. É o
  destino final de todo aprendizado — o que a IA descobre deve virar regra.
- **Conta** (`accounts`): corrente, poupança, cartão de crédito, investimento.
- **Sugestão de classificação** _(nova, ainda não existe)_: transação, categoria
  proposta, confiança, origem (regra, cache ou IA), estado de revisão.

---

## Critérios de Sucesso

- **CS-001**: Registrar uma despesa avulsa no celular leva menos de 15 segundos,
  do desbloqueio à confirmação.
- **CS-002**: Ao fim de um mês de uso, menos de 10% das transações do mês estão
  sem categoria.
- **CS-003**: Menos de 20% das transações de um lote chegam a exigir chamada a
  modelo de IA, e essa proporção cai a cada mês.
- **CS-004**: O custo de IA de um mês fechado fica abaixo do teto definido na
  configuração — e idealmente em zero, usando a rota via assinatura já paga.
- **CS-005**: Os dois usuários conseguem, sem ajuda, responder "quanto gastamos
  em [categoria] neste mês" em menos de 30 segundos.
- **CS-006**: Nenhuma transferência entre contas do casal aparece como despesa no
  relatório mensal.
- **CS-007**: Um merge de upstream é concluído sem conflito fora dos arquivos
  reconhecidamente do fork (`AGENTS.md`, `CLAUDE.md`, `infra/`, diretórios custom).

---

## Fora de Escopo

Permanente, salvo decisão explícita registrada em emenda a esta spec:

- Multi-tenant ou oferta como serviço para terceiros.
- Moedas além de BRL.
- Aplicativo nativo publicado em loja — o PWA cobre o caso.
- Integração com contabilidade, imposto de renda ou emissão fiscal.
- Qualquer coisa que exija sair da free tier do GCP sem decisão consciente.

---

## Premissas

- Os dois usuários confiam um no outro com acesso total ao mesmo orçamento; não
  há necessidade de permissão granular.
- O volume é de finanças pessoais — centenas de transações por mês, não milhares.
  Decisões de performance podem assumir essa escala.
- O cartão de crédito concentra a maior parte das despesas, então importação de
  fatura tem alcance maior que registro manual.
- A VM `e2-micro` continua sendo o alvo até que uma feature justifique o upgrade
  por escrito.
- Enviar descrição, valor e data de transação para provider externo de IA é
  aceitável para ambos os usuários. Dados que identificam conta ou pessoa, não.

---

## Impacto na Constituição

Esta spec é a origem dos princípios III (determinístico antes de IA), IV (IA
plugável e barata), V (orçamento da VM) e VIII (privacidade explícita) da
constituição. Emendar esta spec em qualquer desses pontos exige reavaliar o
princípio correspondente.

---

## Backlog de features

Numeração real, sincronizada com o que existe em `specs/`.

### Entregue

| #       | Feature                                                                                   | Estado                          |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| **001** | Desligar por padrão o enriquecimento por IA — `specs/001-desligar-padrao-enriquecimento/` | ✅ implementada, PR #3 mergeado |

### Em andamento

| #       | Feature                                                                                                                     | Por que importa                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **002** | **Sync do cartão de crédito via Pluggy** + modelagem da conta de cartão no Actual (On Budget, pagamento como transferência) | Ataca o problema central: é o caminho de menor atrito para as despesas entrarem, e é grátis para uso pessoal. |

### Candidatas

| #       | Feature                                                                                                                                                                                                                         | Por que importa                                                                                           | Depende de |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| **003** | Camada determinística de classificação — normalização de descrição, cache e geração de regras nativas a partir de acertos confirmados.                                                                                          | Faz a proporção de chamadas à IA cair com o tempo (CS-003). Princípio III.                                | 002        |
| **004** | Reconstruir a classificação por IA com provider plugável, few-shot do histórico e testes — substitui o `app-ai.ts` desligado em `001`.                                                                                          | Hoje o provider é Gemini hardcoded, sem teste. Princípios IV e VII.                                       | 003        |
| **005** | **Servidor MCP local** — expõe ao Claude Code ferramentas sobre o orçamento: listar transações sem categoria, aplicar categorias em lote, criar regras nativas, gerar relatório. Roda fora da VM, na assinatura Claude já paga. | Custo de IA tende a zero e tira carga da `e2-micro`. Rota preferida pelo princípio IV.                    | 003        |
| **006** | Lançamento rápido de despesa no celular.                                                                                                                                                                                        | Ataca o CS-001 e a parte da História 1 que o cartão não cobre: dinheiro e Pix.                            | —          |
| **007** | Carga histórica das faturas em XLSX — roda uma vez, para o período que o Open Finance não devolver.                                                                                                                             | Escopo bem menor que um importador recorrente: intervalo fechado, tolera imperfeição, sem dedup complexa. | 002        |
| **008** | Detecção de transferências entre contas, parcelamentos e aportes de investimento.                                                                                                                                               | RF-008, RF-009, CS-006. Sem isso o relatório mente.                                                       | 002        |
| **009** | Resumo mensal e insights.                                                                                                                                                                                                       | RF-010, CS-005. O valor final para a Julia.                                                               | 003, 008   |

---

## Histórico

| Data       | Mudança                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-09 | Criação. Consolida o conteúdo de `.cursor/rules/instructions.mdc`, `.github/copilot-instructions.md` e `.windsurf/rules/instructions.md`, removidos na mesma mudança.                                                                                                                                                                                                                                          |
| 2026-08-10 | Duas correções factuais após analisar faturas reais do Itaú e o código do `app-pluggyai`: o sync automático **não** tem custo mensal para uso pessoal, e o import de arquivo é mais difícil de acertar do que se supunha. A ordem das abordagens inverteu. Backlog renumerado para bater com `specs/` — `001` era descrito como servidor MCP, mas a feature entregue com esse número foi o desligamento da IA. |
