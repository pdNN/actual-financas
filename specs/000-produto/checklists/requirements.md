# Checklist de Qualidade da Especificação: actual-financas — o produto

**Propósito**: validar completude e qualidade da spec-mãe antes que features
sejam derivadas dela.
**Criado em**: 2026-08-09
**Feature**: `specs/000-produto/`

## Qualidade do Conteúdo

- [x] CHK001 Sem detalhes de implementação (linguagens, frameworks, APIs) nas histórias e requisitos [Spec §Cenários, §Requisitos]
- [x] CHK002 Focada em valor para o usuário e no problema real [Spec §O problema]
- [x] CHK003 Escrita para quem não é técnico [Spec §Contexto]
- [x] CHK004 Todas as seções obrigatórias preenchidas

## Completude dos Requisitos

- [x] CHK005 Nenhum marcador [NECESSITA ESCLARECIMENTO] pendente
- [x] CHK006 Requisitos são testáveis e não-ambíguos [Spec §Requisitos Funcionais]
- [x] CHK007 Critérios de sucesso são mensuráveis [Spec §Critérios de Sucesso]
- [x] CHK008 Critérios de sucesso são agnósticos de tecnologia [Spec §Critérios de Sucesso]
- [x] CHK009 Todos os cenários de aceitação estão definidos, em Dado/Quando/Então
- [x] CHK010 Casos de borda identificados [Spec §Casos de Borda]
- [x] CHK011 Escopo claramente delimitado [Spec §Fora de Escopo]
- [x] CHK012 Dependências e premissas identificadas [Spec §Premissas]

## Prontidão

- [x] CHK013 Todo requisito funcional rastreia até ao menos uma história
- [x] CHK014 As histórias cobrem os fluxos principais e são independentemente testáveis
- [x] CHK015 A História 1 sozinha entrega um MVP com valor real [Spec §História 1]
- [x] CHK016 Entidades-chave mapeadas ao schema existente [Spec §Entidades-Chave]

## Conformidade com a Constituição

- [x] CHK017 A spec respeita os princípios de `.specify/memory/constitution.md`
- [x] CHK018 As restrições de privacidade estão explícitas [Spec RF-011, §Premissas]
- [x] CHK019 A restrição da VM `e2-micro` está registrada como premissa [Spec §Premissas]
- [x] CHK020 A compatibilidade com upstream é um critério de sucesso verificável [Spec CS-007]

## Pontos em aberto, deliberadamente

- [ ] CHK021 A escolha entre import, lançamento rápido e sync automático está adiada para o `/speckit.plan` da feature de registro — decisão consciente, não lacuna [Spec §História 1, Premissa]
- [ ] CHK022 O teto de custo de IA do CS-004 ainda não tem valor numérico definido [Lacuna — definir quando a feature 001 ou 003 for planejada]
- [ ] CHK023 O limiar de confiança do RF-004 ainda não tem valor definido [Lacuna — definir na feature 002 ou 003]

## Notas

CHK021 a CHK023 estão abertos de propósito: são decisões que dependem de dados
que ainda não existem (custo real de um lote, distribuição real de confiança do
modelo). Registrá-los aqui evita que sejam esquecidos e evita que virem chute
prematuro na spec-mãe.
