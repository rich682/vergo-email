# Vergo Inbox v2

AI-powered email response tracking for accounting teams.

## Canonical architecture (single path)
- Platform: **Vercel** (Next.js App Router, serverless)
- Build: **npm run build** (Node **20** LTS)
- Source of truth: **GitHub main**
- Database: **PostgreSQL** via Prisma (`DATABASE_URL` you provide)
- Auth: **NextAuth.js**
- Background jobs: **Inngest**
- UI: **Tailwind CSS + shadcn/ui**
- No Docker, no Cloud Build, no containers.

## Local development (Node 20)
1. Install deps  
   ```bash
   npm ci
   ```
2. Configure env (create `.env` with required secrets):  
   - `DATABASE_URL` (Postgres)  
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (http://localhost:3000)  
   - `OPENAI_API_KEY`, `ENCRYPTION_KEY`  
   - Gmail optional: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`  
   - Inngest keys if used locally.
3. Prepare DB  
   ```bash
   npx prisma db push
   npx prisma db seed   # optional sample data if seed is configured
   ```
4. Run app  
   ```bash
   npm run dev
   ```
5. (Optional) Inngest dev worker  
   ```bash
   npx inngest-cli@latest dev
   ```

## Deployment (Vercel-only)
- Push to **main** → Vercel builds with `npm run build` on Node 20.
- No alternate pipelines or container builds.
- Ensure env vars are set in Vercel (same names as above).

## Email provider env vars
- Gmail: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`
- Microsoft: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` (or `common`), `MS_REDIRECT_URI`
- Storage: `BLOB_READ_WRITE_TOKEN` (Vercel Blob; falls back to local in dev)

## Testing & build checks
- Production build: `npm run build`
- Prisma client: `npm run db:generate`
- Lint (optional if enabled): `npm run lint`

## Running Tests
- Required: `TEST_DATABASE_URL` (database name must contain `_test`, `-test`, `test_`, or `test-`)
- Warning: Tests modify database data
- Commands:
  - `npm test` - Run all tests
  - `npm run test:api` - Run API tests only
  - `npm run test:ui` - Run UI tests only
  - `npm run test:watch` - Watch mode

## Project structure
- `app/` — Next.js routes & API
- `components/` — UI and feature components
- `lib/` — services and utilities
- `inngest/` — background job entrypoints
- `prisma/` — schema and seed

## Non-goals
- No Docker / container orchestration
- No Cloud Build / GCP CI
- No alternate deploy targets beyond Vercel

## Optional: Gmail OAuth
Create OAuth credentials in Google Cloud Console, enable Gmail API, and set redirect URI:  
`http://localhost:3000/api/oauth/gmail/callback` (or your deployed URL). Update env vars accordingly.

## Development Scripts

- `npm run dev` - Start Next.js development server
- `npm run setup:db` - Set up database (push schema + seed)
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push database schema changes
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with test data
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm run dev:full` - Start Next.js dev server (alias for `npm run dev`)

## License

Private

