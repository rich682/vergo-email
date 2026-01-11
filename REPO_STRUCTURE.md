# Repository Structure Guidelines

This document outlines the canonical structure and hygiene rules for this repository.

## Top-Level Folders

- **`app/`** — Next.js App Router routes and API endpoints
- **`components/`** — React UI components (shadcn/ui and custom components)
- **`lib/`** — Services, utilities, and shared business logic
- **`inngest/`** — Background job handlers (Inngest functions)
- **`prisma/`** — Database schema and migrations
- **`scripts/`** — Utility scripts (backfills, cleanup, hygiene checks)
- **`tests/`** — Test files (Vitest)

## Critical Rules

### Config Files (One Instance Only)

- **Tailwind config:** Only one config file exists at `tailwind.config.ts`
  - Do NOT create `tailwind.config 2.ts`, `tailwind.config.js`, or duplicates
  - The config must include `tailwindcss-animate` plugin (components use it)

- **Package lock:** Only one `package-lock.json` exists at root
  - Do NOT commit `package-lock 2.json` or duplicates

- **TypeScript env:** Only one `next-env.d.ts` exists at root
  - Do NOT commit `next-env.d 2.ts` or duplicates

### File Naming (No Duplicates)

**Never commit files with these patterns:**
- `* 2.*` (e.g., `tailwind.config 2.ts`)
- `*_2.*` (e.g., `schema_2.prisma`)
- `* copy*` (e.g., `config copy.json`)
- `*.bak`, `*.orig`, `*.tmp` (backup files)

**Why:** These indicate accidental duplicates or backup files that should be removed.

### Database Migrations

- **Use Prisma migrations:** `npm run db:migrate` or `npm run db:push`
- **Do NOT add raw SQL files:** `apply_migration.sql` should not exist
- **Schema changes:** Always update `prisma/schema.prisma` and use Prisma commands

### Inngest Event Handlers

- **All emitted events must have handlers:**
  - If you emit `inngest.send({ event: "my/event" })`, ensure `inngest/functions/index.ts` has a handler
  - Dead event paths indicate unused or broken code paths

### Scripts in package.json

- **All scripts must reference existing files:**
  - If `"my:script": "tsx scripts/my-script.ts"`, ensure `scripts/my-script.ts` exists
  - If `"my:script": "./scripts/my-script.sh"`, ensure `scripts/my-script.sh` exists

### Empty Directories

- **Do not commit empty directories** under `app/`, `components/`, `inngest/`, `lib/`, `scripts/`
- Empty directories indicate incomplete work or accidental creation

## Running Hygiene Checks

Before committing, run:
```bash
npm run hygiene    # Check for duplicates, dead scripts, empty dirs
npm test           # Run test suite
npm run build      # Verify build passes
```

## CI/CD

CI should run these checks in order:
1. `npm run hygiene` — Repository structure validation
2. `npm test` — Test suite
3. `npm run build` — Build verification

## Questions?

If you're unsure whether a file/folder should exist, check:
1. Is it referenced/imported anywhere?
2. Does it follow the naming patterns above?
3. Run `npm run hygiene` to catch common issues


