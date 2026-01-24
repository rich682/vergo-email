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

## Date & Timezone Handling (CRITICAL)

All date operations must follow these rules to prevent off-by-one day errors.

### Organization Timezone

Organizations have a `timezone` field (e.g., `"America/New_York"`) stored in the database. This is the source of truth for all date calculations.

**Utility Location**: `lib/utils/timezone.ts`

### Date Field Categories

| Category | Examples | Storage | Display Rule |
|----------|----------|---------|--------------|
| **Date-only** | `dueDate`, `periodStart`, `periodEnd` | ISO string with `T00:00:00.000Z` | Parse date part only |
| **Timestamp** | `createdAt`, `updatedAt`, `sentAt` | Full ISO timestamp | Standard timezone conversion OK |

### CRITICAL: Date-Only Field Parsing

**WRONG** - Causes off-by-one errors:
```typescript
// DON'T DO THIS - UTC midnight shifts day in local time
format(new Date(task.dueDate), "MMM d")  // Jan 31 UTC → Jan 30 EST
new Date(board.periodStart).toLocaleDateString()
```

**RIGHT** - Extract date part, create local date:
```typescript
// Always parse date-only fields this way
function parseDateOnly(dateStr: string): Date {
  const datePart = dateStr.split("T")[0]
  const [year, month, day] = datePart.split("-").map(Number)
  return new Date(year, month - 1, day)
}

format(parseDateOnly(task.dueDate), "MMM d")  // Correct: Jan 31
```

### Where to Apply

| Location | Field | Pattern |
|----------|-------|---------|
| Job detail page | `dueDate` | `parseDateOnly()` |
| Boards page | `periodStart`, `periodEnd`, `dueDate` | `parseDateOnly()` or `formatPeriodDisplay()` |
| Data snapshots | `periodStart`, `periodEnd` | `parseDateOnly()` |
| Email templates | `dueDate` | `parseDateOnly()` |
| Compare view | `periodStart` | `parseDateOnly()` |

### Board Creation & Automation

When creating recurring boards:

1. **Get today in org timezone**: Use `getTodayInTimezone(timezone)` from `lib/utils/timezone.ts`
2. **Calculate period boundaries**: Use `getStartOfPeriod()`, `getEndOfPeriod()`, `calculateNextPeriodStart()`
3. **Generate board names**: Use `generatePeriodBoardName()` with org timezone
4. **Skip if no timezone**: Org must have timezone configured for recurring boards

### Pre-Commit Checklist

Before committing date-related changes:
- [ ] Date-only fields use `parseDateOnly()` or equivalent
- [ ] Board period calculations use org timezone
- [ ] No `new Date(dateString)` on date-only fields
- [ ] No hardcoded "UTC" fallbacks

## Non-goals / removed
- No Docker or container orchestration
- No Cloud Build / GCP CI
- No alternate deploy targets beyond Vercel
- No new Job types (use capabilities instead)
- No Approval workflows in current taxonomy
