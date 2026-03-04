# GitHub Copilot Instructions — actual-financas

## CRITICAL: Read This First

This project is **100% built and maintained by LLM agents**. Every implementation, bugfix, and feature is done via AI coding assistants (Copilot, Cursor, Windsurf, etc.). Follow these instructions precisely.

---

## 1. Project Identity

- **What**: Personal finance system for a couple (Pedro + Julia) to track expenses, credit card bills, bank statements, budgets, and investments.
- **Base**: Fork of [actualbudget/actual](https://github.com/actualbudget/actual) (open-source, MIT license).
- **Currency**: BRL (Brazilian Real). All amounts, formatting, and locale must use pt-BR.
- **Stack**: TypeScript monorepo, React frontend, Express sync-server, SQLite (via better-sqlite3), Yarn 4 workspaces.
- **Deploy Target**: Google Cloud Compute Engine `e2-micro` (always free tier).
- **GCP Project ID**: `actual-financas`
- **GCP Account**: `pedrolucho02@gmail.com`
- **gcloud config**: `pessoal`

---

## 2. Fork Management — DO NOT Break Upstream Sync

This is a **fork**. We regularly pull updates from `actualbudget/actual` upstream. To avoid merge conflicts:

### RULES:
1. **NEVER modify existing upstream files** unless absolutely necessary. If you must, make minimal surgical changes.
2. **Prefer creating NEW files** over editing existing ones. Place custom code in clearly separated directories.
3. **Custom code directories** (create these, they don't exist upstream):
   - `packages/custom/` — Custom modules, scripts, AI classification pipeline
   - `packages/desktop-client/src/components/custom/` — Custom UI components
   - `packages/sync-server/src/custom/` — Custom server endpoints
   - `packages/loot-core/src/custom/` — Custom business logic
4. **Configuration overrides**: Use environment variables and `config.json` rather than editing source code.
5. **If you MUST edit an upstream file**, mark your changes with comments:
   ```typescript
   // >>> CUSTOM: actual-financas — description of change
   your custom code here
   // <<< END CUSTOM
   ```
6. **Never rewrite, delete, or restructure upstream files/directories.**
7. **Keep `package.json` changes minimal** — only add dependencies, don't remove or change existing ones.

### Upstream Sync Workflow:
```bash
git remote add upstream https://github.com/actualbudget/actual.git
git fetch upstream
git merge upstream/master  # Resolve conflicts carefully preserving custom markers
```

---

## 3. Task Management — Notion Kanban (MANDATORY)

**Before starting ANY implementation task**, you MUST create a card in the Notion Kanban board.

- **Notion Kanban URL**: https://www.notion.so/pedro-lucho/31965a687fba80a59c41d52fba00607b?v=31965a687fba805681ef000ca40a8e23
- **Notion Data Source ID**: `31965a68-7fba-801f-8f68-000bebc70b39`
- **Database Name**: "Actual Finanças"
- **Workflow**: Create task → Move to "In Progress" → Implement → Move to "Done"
- If you have access to the Notion MCP/API, create the card programmatically using the data source ID above.
- If you don't have access, tell the user to create the card manually before proceeding.

**Card Schema:**
| Property | Type | Values |
|----------|------|--------|
| `Name` | title | Task title |
| `Status` | status | `Not started`, `In progress`, `Done` |
| `Priority` | select | `Critical`, `High`, `Medium`, `Low` |
| `Phase` | select | `Phase 1 — Infra`, `Phase 2 — Base Setup`, `Phase 3 — AI Pipeline`, `Phase 4 — Custom Features` |
| `Tags` | multi_select | `docker`, `gcp`, `ci-cd`, `pluggy`, `ai`, `frontend`, `backend`, `config`, `reports`, `import` |
| `Assign` | person | User ID |

---

## 4. Implementation Plan (Phased)

### Phase 1 — Infrastructure & Deploy
- [ ] Dockerize for GCE e2-micro deployment
- [ ] Terraform or gcloud scripts for provisioning
- [ ] Caddy reverse proxy + TLS (DuckDNS or custom domain)
- [ ] CI/CD pipeline (GitHub Actions → build Docker → deploy to GCE)
- [ ] Backup strategy for SQLite files to GCS

### Phase 2 — Base Configuration
- [ ] Configure BRL currency and pt-BR locale
- [ ] Set up Pluggy.ai integration for Brazilian banks (Itaú, XP, Nubank, etc.)
- [ ] Create account structure (checking, savings, credit cards, investments)
- [ ] Define budget categories and groups (moradia, mercado, transporte, lazer, investimentos, etc.)
- [ ] Set up authentication (password for 2 users)

### Phase 3 — AI Classification Pipeline
- [ ] Python script or Node.js module for transaction classification
- [ ] LLM integration (Gemini API or GPT-4o-mini) with few-shot prompting
- [ ] Learn from user's historical classifications
- [ ] Auto-detect transfers between accounts (PIX between banks)
- [ ] OFX/CSV import with auto-classification
- [ ] Payslip/holerite reader (PDF → OCR → structured data)

### Phase 4 — Custom Features
- [ ] Dashboard for tracking installments (parcelas em aberto)
- [ ] Monthly projection (quanto vou gastar este mês / próximo mês)
- [ ] Spending by category and subcategory reports
- [ ] Third-party debts tracker (quem me deve)
- [ ] Investment gap analysis (quanto falta investir)
- [ ] Shared dashboard for Pedro + Julia

---

## 5. Code Style (from AGENTS.md)

### Commands — ALWAYS run from root:
```bash
yarn typecheck    # ALWAYS before committing
yarn lint:fix     # Auto-fix linting
yarn test         # Run all tests
yarn start        # Dev server on port 3001
```

### TypeScript:
- Use `type` over `interface`
- No `enum` — use objects/maps
- No `any`/`unknown` unless absolutely necessary
- Use `satisfies` instead of `as`
- Inline type imports: `import { type MyType } from '...'`

### React:
- Functional components only, no classes
- Don't use `React.FC` — type props directly
- Named exports only (no default exports)
- Use hooks from `src/hooks` (not react-router directly)
- Use `useDispatch()`/`useSelector()` from `src/redux` (not react-redux)

### Imports (ordered by ESLint):
1. React
2. Node.js built-ins
3. External packages
4. Actual packages (`loot-core`, `@actual-app/components`)
5. Parent → Sibling → Index imports

### Git:
- **ALL commits MUST be prefixed with `[AI]`** — e.g., `[AI] Add BRL classification pipeline`
- **ALL PR titles MUST be prefixed with `[AI]`**
- Never force push, hard reset, or skip hooks
- Never commit unless explicitly asked

### i18n:
- All user-facing strings must use `Trans` component or `t()` function
- Generate i18n: `yarn generate:i18n`

---

## 6. Architecture Reference

### Monorepo Packages:
| Package | Path | Alias | Purpose |
|---------|------|-------|---------|
| loot-core | `packages/loot-core/` | `loot-core` | Core business logic (platform-agnostic) |
| desktop-client | `packages/desktop-client/` | `@actual-app/web` | React UI (web + desktop) |
| sync-server | `packages/sync-server/` | `@actual-app/sync-server` | Express server + static frontend |
| api | `packages/api/` | `@actual-app/api` | Node.js API for programmatic access |
| component-library | `packages/component-library/` | `@actual-app/components` | Shared UI components |
| crdt | `packages/crdt/` | `@actual-app/crdt` | CRDT sync logic |
| desktop-electron | `packages/desktop-electron/` | — | Electron wrapper |
| plugins-service | `packages/plugins-service/` | — | Plugin system |

### Data Storage:
- **SQLite only** (via `better-sqlite3`) — no external databases
- `account.sqlite` — auth/sessions (in `ACTUAL_SERVER_FILES` dir)
- Per-budget `.sqlite` files — sync data (in `ACTUAL_USER_FILES` dir)
- All paths configurable via env vars: `ACTUAL_DATA_DIR`, `ACTUAL_SERVER_FILES`, `ACTUAL_USER_FILES`

### Server:
- Express on port 5006 (configurable via `ACTUAL_PORT`)
- Serves API routes + static React build in production
- Bank sync: Pluggy.ai (Brazil), GoCardless (EU), SimpleFIN (US)
- Config via `config.json` or environment variables (see `packages/sync-server/src/load-config.js`)

### Frontend:
- React 19 + Vite + Emotion CSS
- PWA enabled (mobile-friendly, installable)
- Responsive: `components/mobile/` for narrow layouts, auto-switches via `useResponsive()`
- 4 themes: dark, light, midnight, development
- Recharts for graphs, react-grid-layout for dashboards

---

## 7. Key Files to Know

| File | Purpose |
|------|---------|
| `AGENTS.md` | Full AI agent guide (upstream) |
| `CODE_REVIEW_GUIDELINES.md` | Code review rules |
| `sync-server.Dockerfile` | Production Docker build |
| `docker-compose.yml` | Dev container |
| `packages/sync-server/src/load-config.js` | All server config options |
| `packages/sync-server/src/app.ts` | Server entry point |
| `packages/desktop-client/vite.config.mts` | Frontend build config |
| `packages/sync-server/src/app-pluggyai/` | Pluggy.ai bank sync (Brazil) |

---

## 8. Environment Requirements

- **Node.js**: >= 22
- **Yarn**: ^4.9.1
- **Docker**: For production build
- **GCP gcloud CLI**: For deployment
- **Python 3**: For AI classification pipeline (separate from main app)
