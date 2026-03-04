---
description: Master instructions for all AI agents working on actual-financas — personal finance system built on Actual Budget fork
---

# Windsurf Rules — actual-financas

## CRITICAL: This Project is 100% LLM-Built

Every feature, bugfix, and implementation is done by AI coding assistants. Follow these instructions precisely. No exceptions.

---

## 1. Project Identity

| Key | Value |
|-----|-------|
| **What** | Personal finance system for Pedro + Julia (couple) |
| **Base** | Fork of [actualbudget/actual](https://github.com/actualbudget/actual) |
| **License** | MIT |
| **Currency** | BRL (Brazilian Real), locale pt-BR |
| **Stack** | TypeScript monorepo, React 19, Express, SQLite, Yarn 4 |
| **Deploy** | GCP Compute Engine `e2-micro` (free tier) |
| **GCP Project** | `actual-financas` |
| **GCP Account** | `pedrolucho02@gmail.com` |
| **gcloud config** | `pessoal` |

### Goals:
- Import credit card bills and bank statements (OFX/CSV + Pluggy.ai sync)
- AI-powered auto-classification of transactions using LLM
- Envelope budgeting with spending targets
- Track where money is, what's missing for investments, installments in progress
- Shared access for both users via web (PWA mobile-friendly)

---

## 2. Fork Management — PROTECT Upstream Compatibility

This repo is a FORK of `actualbudget/actual`. We pull upstream updates regularly. **Breaking upstream merge = critical failure.**

### MANDATORY Rules:

1. **NEVER modify existing upstream files** unless absolutely necessary.
2. **Create NEW files** in custom directories instead of editing upstream:
   - `packages/custom/` — Scripts, AI pipeline, utilities
   - `packages/desktop-client/src/components/custom/` — Custom UI
   - `packages/sync-server/src/custom/` — Custom API endpoints
   - `packages/loot-core/src/custom/` — Custom business logic
3. **If you MUST edit an upstream file**, wrap changes with markers:
   ```typescript
   // >>> CUSTOM: actual-financas — [description]
   your code here
   // <<< END CUSTOM
   ```
4. **Never delete, rename, or restructure upstream files.**
5. **package.json**: Only ADD dependencies. Never remove or change existing ones.
6. **Test your changes don't break existing tests**: `yarn typecheck && yarn lint:fix && yarn test`

### Upstream Sync:
```bash
git remote add upstream https://github.com/actualbudget/actual.git
git fetch upstream
git merge upstream/master
```

---

## 3. Task Management — Notion Kanban (MANDATORY BEFORE CODING)

**BEFORE writing ANY code for a new feature/task**, a card MUST exist in the Notion Kanban.

- **Board URL**: https://www.notion.so/pedro-lucho/31965a687fba80a59c41d52fba00607b?v=31965a687fba805681ef000ca40a8e23
- **Notion Data Source ID**: `31965a68-7fba-801f-8f68-000bebc70b39`
- **Database Name**: "Actual Finanças"
- **Process**: Create card → "In Progress" → Implement → "Done"
- If you have Notion MCP access, create the card via API using the data source ID above.
- If you don't, ask the user to create it before you start coding.

**Card Schema:**
| Property | Type | Values |
|----------|------|--------|
| `Name` | title | Task title |
| `Status` | status | `Not started`, `In progress`, `Done` |
| `Priority` | select | `Critical`, `High`, `Medium`, `Low` |
| `Phase` | select | `Phase 1 — Infra`, `Phase 2 — Base Setup`, `Phase 3 — AI Pipeline`, `Phase 4 — Custom Features` |
| `Tags` | multi_select (JSON array) | `docker`, `gcp`, `ci-cd`, `pluggy`, `ai`, `frontend`, `backend`, `config`, `reports`, `import` |
| `Assign` | person | User ID |

---

## 4. Implementation Roadmap

### Phase 1 — Infrastructure
- Dockerize for GCE e2-micro (use `sync-server.Dockerfile` as base)
- gcloud/Terraform provisioning scripts
- Caddy reverse proxy + automatic TLS
- GitHub Actions CI/CD → Docker build → deploy to GCE
- SQLite backup to GCS bucket

### Phase 2 — Base Setup
- BRL currency + pt-BR locale configuration
- Pluggy.ai setup for Brazilian banks (Itaú, XP, Nubank)
- Account structure (checking, savings, credit cards, investments)
- Budget categories/groups (moradia, mercado, transporte, lazer, investimentos)
- 2-user authentication

### Phase 3 — AI Classification Pipeline
- Transaction classification module (Python or Node.js)
- LLM integration (Gemini API / GPT-4o-mini) with few-shot from history
- Auto-detect inter-account transfers
- OFX/CSV import with auto-classification
- Payslip/holerite PDF reader (OCR → structured data)

### Phase 4 — Custom Features
- Installment tracker (parcelas em aberto)
- Monthly spending projection
- Category/subcategory spending reports
- Third-party debt tracker
- Investment gap analysis
- Shared dashboard for 2 users

---

## 5. Code Conventions (from AGENTS.md)

### Commands — ALWAYS from repo root:
```bash
yarn typecheck        # ALWAYS before commit
yarn lint:fix         # Auto-fix
yarn test             # All tests via lage
yarn start            # Dev server :3001
yarn start:server-dev # Sync server :5006 + frontend
```

### TypeScript:
- `type` over `interface`; no `enum`; no `any`/`unknown`
- `satisfies` over `as`; inline type imports
- Functional patterns only, no classes

### React:
- No `React.FC` — type props directly
- Named exports only
- Hooks from `src/hooks` (not react-router)
- Redux from `src/redux` (not react-redux)
- `Trans` component for i18n strings

### Imports (ESLint-enforced order):
1. React → 2. Node.js → 3. External → 4. Actual packages → 5. Relative

### Git — HARD REQUIREMENTS:
- **ALL commits: `[AI] description here`**
- **ALL PR titles: `[AI] description here`**
- Never force push, hard reset, skip hooks
- Never commit unless user explicitly asks

### Code Review (from CODE_REVIEW_GUIDELINES.md):
- No new `@ts-strict-ignore` comments
- No new `eslint-disable` / `oxlint-disable` comments
- No `any`/`unknown` without justification
- All user-facing strings must be i18n translated
- Financial numbers: use `FinancialText` or `styles.tnum`
- Minimize test mocking — prefer real implementations

---

## 6. Architecture Quick Reference

### Packages:
| Package | Alias | Purpose |
|---------|-------|---------|
| `packages/loot-core/` | `loot-core` | Core logic (platform-agnostic) |
| `packages/desktop-client/` | `@actual-app/web` | React frontend |
| `packages/sync-server/` | `@actual-app/sync-server` | Express API + static serve |
| `packages/api/` | `@actual-app/api` | Programmatic Node.js API |
| `packages/component-library/` | `@actual-app/components` | Shared UI components |
| `packages/crdt/` | `@actual-app/crdt` | CRDT sync |
| `packages/custom/` | — | **OUR custom code (not upstream)** |

### Data:
- SQLite only (better-sqlite3), no external DB
- Config: env vars or `config.json` (see `packages/sync-server/src/load-config.js`)
- Bank sync: Pluggy.ai (Brazil), GoCardless (EU), SimpleFIN (US)

### Frontend:
- PWA-enabled, responsive (auto narrow/wide layout)
- Themes: dark, light, midnight
- Mobile: `components/mobile/` — full mobile UI with swipe, pull-to-refresh

---

## 7. Key Files

| File | What |
|------|------|
| `AGENTS.md` | Upstream AI agent instructions |
| `CODE_REVIEW_GUIDELINES.md` | Review standards |
| `sync-server.Dockerfile` | Production Docker |
| `packages/sync-server/src/load-config.js` | All config options |
| `packages/sync-server/src/app.ts` | Server entry |
| `packages/sync-server/src/app-pluggyai/` | Pluggy.ai integration |
| `packages/desktop-client/vite.config.mts` | Frontend build |
| `.github/copilot-instructions.md` | GitHub Copilot version of these rules |

---

## 8. Environment

- **Node.js** >= 22 | **Yarn** ^4.9.1 | **Docker** for prod | **gcloud CLI** for deploy
