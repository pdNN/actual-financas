# AGENTS.md — actual-financas

Guia técnico para agentes de IA que trabalham neste repositório.

> **Este arquivo pertence ao fork.** Ele substituiu o `AGENTS.md` do upstream, e
> por isso conflita em merges com `actualbudget/actual`. Na resolução, mantenha a
> versão do fork e traga do upstream apenas fatos técnicos novos.
>
> **Hierarquia de autoridade:**
>
> 1. `.specify/memory/constitution.md` — as regras do projeto. Vence sempre.
> 2. `CLAUDE.md` — resumo operacional e fluxo SDD.
> 3. Este arquivo — referência técnica de arquitetura e estilo.
> 4. `CODE_REVIEW_GUIDELINES.md` — padrões de revisão.

---

## 1. O projeto

Finanças pessoais do Pedro e da Julia (casal), sobre um **fork de
[actualbudget/actual](https://github.com/actualbudget/actual)** a partir da v26.3.0.
Monorepo TypeScript, Yarn 4 workspaces, orquestrado por **lage**. React 19 no
front, Express no servidor de sync, SQLite (`better-sqlite3`) como único banco.
BRL, pt-BR. Produção em GCE `e2-micro` com Caddy e TLS automático.

Visão de produto e backlog: `specs/000-produto/spec.md`.

## 2. Fluxo obrigatório: SDD

**Nenhuma mudança de comportamento entra sem especificação aprovada em
`specs/NNN-slug/spec.md`.**

```
/speckit.specify → /speckit.clarify → /speckit.plan → /speckit.tasks → /speckit.implement
```

Exceções que dispensam spec: typo, bump de dependência, merge de upstream,
mudança restrita a `infra/`, e hotfix (que exige spec retroativa antes do merge
seguinte). Detalhes em `CLAUDE.md` e no princípio I da constituição.

Especificações vivem em `specs/NNN-slug/`. **Não use `docs/specs/`.**

## 3. Compatibilidade com upstream

Fork vivo. Quebrar o merge de upstream é falha crítica.

- Código novo em diretório custom: `packages/custom/`,
  `packages/loot-core/src/custom/`, `packages/desktop-client/src/components/custom/`,
  `packages/sync-server/src/custom/`.
- Edição em arquivo do upstream é último recurso, sempre cercada por:
  ```ts
  // >>> CUSTOM: actual-financas — [descrição]
  // <<< CUSTOM
  ```
- Nunca deletar, renomear ou reestruturar arquivo do upstream.
- `package.json`: só **adicionar** dependências.

Sincronizar com o upstream:

```bash
git remote add upstream https://github.com/actualbudget/actual.git   # uma vez
git fetch upstream && git merge upstream/master
```

---

## 4. Comandos

Sempre da **raiz** do repositório.

```bash
yarn typecheck          # tsgo + lage typecheck — obrigatório antes de commitar
yarn lint               # oxfmt --check + oxlint --type-aware
yarn lint:fix           # auto-corrige
yarn test               # todos os pacotes, via lage
yarn test:debug         # sem cache do lage
yarn start              # frontend no navegador, :3001
yarn start:server-dev   # sync-server :5006 + frontend
yarn start:desktop      # app Electron
yarn e2e                # Playwright, web
yarn vrt                # testes de regressão visual
yarn build:server       # build do sync-server
```

Por pacote: `yarn workspace @actual-app/core run test`,
`yarn workspace @actual-app/web e2e`, etc.

**Portão de qualidade** — verde antes de qualquer commit:

```bash
yarn typecheck && yarn lint && yarn test
```

---

## 5. Pacotes

| Pacote                           | Alias                     | Papel                                                                       |
| -------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| `packages/loot-core/`            | `@actual-app/core`        | Lógica de negócio, banco, orçamento, regras, sync. Agnóstico de plataforma. |
| `packages/desktop-client/`       | `@actual-app/web`         | UI React 19 + Vite. PWA, responsivo, temas.                                 |
| `packages/desktop-electron/`     | —                         | Invólucro Electron.                                                         |
| `packages/sync-server/`          | `@actual-app/sync-server` | Servidor Express de sync + serve os estáticos.                              |
| `packages/api/`                  | `@actual-app/api`         | API Node.js programática.                                                   |
| `packages/component-library/`    | `@actual-app/components`  | Componentes de UI e ícones (gerados — não edite).                           |
| `packages/crdt/`                 | `@actual-app/crdt`        | CRDT do sync.                                                               |
| `packages/plugins-service/`      | —                         | Serviço de plugins.                                                         |
| `packages/eslint-plugin-actual/` | —                         | Regras de lint próprias (i18n, tipografia, logger).                         |
| `packages/docs/`                 | —                         | Site de documentação (Docusaurus).                                          |
| `packages/custom/`               | —                         | **Nosso código, fora do upstream.**                                         |

### Diretórios que importam

```
packages/loot-core/src/server/rules/                  # motor de regras
packages/loot-core/src/server/transactions/           # transaction-rules.ts: getProbableCategory, learn_categories
packages/loot-core/src/server/accounts/               # sync.ts, app.ts, importação
packages/loot-core/src/server/sql/init.sql            # schema base
packages/loot-core/migrations/                        # migrações
packages/loot-core/src/{client,server,shared,types}/
packages/desktop-client/src/components/               # UI
packages/desktop-client/src/hooks/                    # hooks próprios
packages/sync-server/src/app-ai/app-ai.ts             # classificador Gemini (custom)
packages/sync-server/src/app-pluggyai/                # sync de bancos brasileiros
infra/                                                # Terraform, Caddy, deploy GCP
```

**Não edite**: `packages/*/{dist,lib-dist,build}/`,
`packages/component-library/src/icons/`, `.lage/`.

---

## 6. Estilo de código

### TypeScript

- `type` em vez de `interface`. Sem `enum` — use objeto ou mapa.
- Evite `any` e `unknown`. Evite `as` e `!` — prefira `satisfies`.
- Import de tipo inline: `import { type MyType } from '...'`.
- Nomes descritivos com verbo auxiliar: `isLoaded`, `hasError`.
- Exports nomeados. Funcional e declarativo — sem classes.

### React

- Nunca `React.FC` / `React.FunctionComponent` — tipe as props direto.
- Sem `React.*`; use imports nomeados.
- `<Link>` em vez de `<a>`.
- `useNavigate()` de `src/hooks` (não de react-router).
- `useDispatch()`, `useSelector()`, `useStore()` de `src/redux` (não de react-redux).
- Sem componentes aninhados instáveis.
- **React Compiler está ligado** (`babel-plugin-react-compiler`) em todos os pacotes
  com React. Ele memoiza o corpo do componente automaticamente, então **não**
  adicione `useCallback`, `useMemo` ou `React.memo` por reflexo — prefira callback
  e valor inline, salvo quando alguma dependência não-compilada exigir identidade estável.

```tsx
type MyComponentProps = {
  value: string;
};

export function MyComponent({ value }: MyComponentProps) {
  return <Text>{value}</Text>;
}
```

### Ordem de imports (o lint impõe)

1. React → 2. Node.js → 3. pacotes externos → 4. pacotes do Actual
   (`loot-core`, `@actual-app/components`) → 5. pai → 6. irmão → 7. índice.

Linha em branco entre grupos.

### Proibições

- `import uuid from 'uuid'` — use `import { v4 as uuidv4 } from 'uuid'`.
- Importar cores diretamente — use o tema.
- Importar `@actual-app/web/*` dentro de `loot-core`.
- Referenciar imports específicos de plataforma (`.api`, `.web`, `.electron`) —
  use os conditional exports de `loot-core`.
- Novos `@ts-strict-ignore`, `eslint-disable`, `oxlint-disable` sem justificativa no plano.

### i18n e números

- Toda string visível ao usuário: componente `Trans` (preferido) ou `t()`.
  Regra de lint própria cobra isso.
- Números financeiros soltos: `FinancialText`, ou `styles.tnum` quando não der para envolver.
- Gerar arquivos de tradução: `yarn generate:i18n`.

---

## 7. Testes

**Vitest**, colocado ao lado do fonte: `arquivo.ts` → `arquivo.test.ts`.
E2E e regressão visual com **Playwright**, em `packages/desktop-client/e2e/`.

```ts
import { describe, it, expect } from 'vitest';

describe('classifyTransaction', () => {
  it('usa a regra nativa antes de chamar a IA', () => {
    expect(result).toBe(expected);
  });
});
```

Princípio VII da constituição: **toda lógica custom tem teste, escrito antes da
implementação, falhando primeiro.** Prefira implementação real a mock — mockar
chamada a modelo de IA é esperado; mockar lógica própria costuma indicar desenho ruim.

Globals do Vitest estão disponíveis. O cache do lage fica em `.lage/`; se os
testes se comportarem de forma estranha, `rm -rf .lage`.

---

## 8. Git

- Branch por feature, formato `NNN-slug`, criada pelo `/speckit.specify`.
- **Todo commit e todo título de PR começa com `[AI] `.** Requisito rígido.
- PR sempre em rascunho.
- Nunca: alterar `git config`, `--force`, `reset --hard` em trabalho publicado,
  `--no-verify`, `--no-gpg-sign`, push forçado em `master`.
- Não commitar sem o usuário pedir.

Regras completas de commit e PR do upstream: `.github/agents/pr-and-commit-rules.md`.

Hook de pre-commit: Husky + lint-staged (oxfmt + oxlint). Rode `yarn prepare`
após instalar dependências.

O upstream também instala **hooks de agente** em `.claude/settings.json`, que
rodam scripts de `scripts/agent-hooks/`: formatam o arquivo editado, barram
`@ts-strict-ignore` em arquivo novo e protegem operações de git. Eles são do
upstream — não desative sem motivo registrado.

---

## 9. Ambiente e problemas comuns

Node 24 (ver `.nvmrc`; `engines` aceita >= 22.18), Yarn ^4.9.1. Módulos nativos
(`better-sqlite3`, `bcrypt`) exigem `gcc`, `make` e `python3`.

| Sintoma                   | O que fazer                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| Erro de tipo              | `yarn typecheck`; confira as conditional exports do `loot-core`     |
| Erro de lint              | `yarn lint:fix`; regras próprias em `packages/eslint-plugin-actual` |
| Teste falhando sem motivo | `yarn test:debug`, ou `rm -rf .lage`                                |
| Import não resolve        | Confira os `exports` do `package.json` do pacote e o alias          |
| Build quebrado            | Apague `dist/`, `lib-dist/`, `build/` e reconstrua                  |

Na tela inicial, "View demo" cria um orçamento de exemplo para testar sem dados reais.

---

## 10. Restrições de produção

| Restrição                          | Consequência prática                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2-micro`, 384MB para o container | Sem dependência pesada no `sync-server`. OCR, backfill e lote grande rodam fora da VM.                                                                                                 |
| SQLite local, sem banco externo    | Migrações em `packages/loot-core/migrations/`.                                                                                                                                         |
| IA plugável                        | Nenhum provider hardcoded; chamadas em lote; custo observável.                                                                                                                         |
| Determinístico antes de IA         | Regras nativas e cache primeiro; IA só no resíduo. A IA pode gravar sem confirmação imposta (III, emenda 2.0.0), com identidade, auditoria com origem, backup e risco informado.       |
| Privacidade — IA                   | Descrição, valor, data e categoria podem ir para IA externa. Conta, cartão, CPF, credencial e senha, nunca. Log sem PII. Chave de API só no servidor.                                  |
| Privacidade — Open Finance         | Agregador regulado pelo BACEN pode receber conta, cartão, saldo e extrato, sob consentimento revogável dado no próprio banco. Senha e token do banco nunca passam pelo nosso servidor. |

Detalhes e a redação normativa: `.specify/memory/constitution.md`.
