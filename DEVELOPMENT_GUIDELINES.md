# Development Guidelines

Single deployment path: Vercel (Next.js App Router, serverless), build via `npm run build` on Node 20. No Docker, no Cloud Build, no alternate pipelines.

## Essentials
- Node: **20** (pinned via `.nvmrc` / `.node-version`; engines in `package.json`).
- Install: `npm ci`.
- Build check: `npm run build` (pre-push hook runs this).
- Prisma: `npx prisma migrate dev --name <name>` for schema changes (creates committed migrations). Seed optional via `npx prisma db seed`.
- Env: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `OPENAI_API_KEY`; optional `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`; Inngest keys if used locally.

## Git hygiene
- Work from `main`; keep changes scoped.
- Before push: clean tree + `npm run build` (hook enforces).
- Never commit secrets, `.env`, `node_modules`, `.next`, or logs.

## Project layout
- `app/` — routes & API
- `components/` — UI and feature components
- `lib/` — services/utilities
- `inngest/` — background job entrypoints
- `prisma/` — schema/seed

## Job Capability Model (Refactor Guardrails)

**Jobs are containers; capabilities define behavior.**

### CRITICAL: Do NOT violate these rules

1. **Do NOT introduce new Job types**: Extend via capabilities (Table, Reconciliation, Request, Evidence).
2. **Do NOT rename**: `Job`, `Board`, `TaskInstance`, `Organization` names are frozen.
3. **Do NOT refactor the Job container itself**: Refactors must target a specific capability.
4. **Capabilities may change independently**: Job lifecycle must remain stable.
5. **Approval logic is OUT OF SCOPE**: Will be layered separately in a future phase.

### Safe Refactoring Pattern

**WRONG**: "Refactor jobs to support approval"  
**RIGHT**: "Add Approval capability to jobs" (future phase)

**WRONG**: "Create new ReconciliationJob type"  
**RIGHT**: "Enable Reconciliation capability on existing Job"

### Reference
- Taxonomy: `docs/product/taxonomy-sheet2-sub-workflows.csv` (see Job Capability column)
- Architecture: `docs/architecture/frontend-backend-contract.md`
- Audit: `docs/product/workflow-audit.md`

## Non-goals / removed
- No Docker or container orchestration
- No Cloud Build / GCP CI
- No alternate deploy targets beyond Vercel
- No new Job types (use capabilities instead)
- No Approval workflows in current taxonomy
