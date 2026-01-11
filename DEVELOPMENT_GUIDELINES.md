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

## Non-goals / removed
- No Docker or container orchestration
- No Cloud Build / GCP CI
- No alternate deploy targets beyond Vercel
