# Vergo Inbox v2

AI-Automated Email Response Tracking System for accounting teams.

## Features

- **Natural Language Email Composition**: Describe what you want to send, AI generates drafts
- **Email-First Task Creation**: Sending emails automatically creates tasks to track responses
- **Multi-Tenant Architecture**: Organization-scoped data isolation
- **Gmail & SMTP Integration**: Send and receive emails via Gmail OAuth or SMTP
- **AI Processing**: Automatic message classification and document verification
- **Automation Rules**: Configure AI automation rules per campaign
- **Scheduled Emails**: CRON-based recurring email campaigns

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Background Jobs**: Inngest
- **AI**: OpenAI (GPT-4o-mini, GPT-4o Vision)
- **Email**: Gmail API, nodemailer, IMAP
- **UI**: Tailwind CSS, shadcn/ui

## Local Testing Setup

### Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
npm run setup:env
```
This will create a `.env` file with secure random secrets. You'll need to configure Gmail OAuth credentials manually if you want to test email sending.

3. **Start PostgreSQL database:**
```bash
docker-compose up -d postgres
```

4. **Set up database and seed test data:**
```bash
npm run setup:db
```
This will:
- Start the PostgreSQL container
- Push the database schema
- Seed the database with test data

5. **Verify setup:**
```bash
npm run verify
```

6. **Start development server:**
```bash
npm run dev
```

7. **Start Inngest dev server (in another terminal):**
```bash
npx inngest-cli@latest dev
```

### Test User Credentials

The seed script creates the following test users:

- **Admin User**: `admin@test.com` / `test123`
- **Member User**: `member@test.com` / `test123`
- **Viewer User**: `viewer@test.com` / `test123`

### Seed Data

The database is seeded with:
- 1 test organization ("Test Accounting Firm")
- 3 test users (admin, member, viewer)
- 6 sample entities (2 employees, 2 vendors, 2 clients)
- 3 entity groups (Employees, Vendors, Clients)
- 3 sample campaigns (W-9 Collection, Expense Reports, Certificate of Insurance)

### Gmail OAuth Setup (Optional)

To test Gmail integration:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/oauth/gmail/callback`
6. Update `.env` file with `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`

### Troubleshooting

**Database connection issues:**
- Ensure Docker is running: `docker ps`
- Check if PostgreSQL container is up: `docker-compose ps`
- Restart container: `docker-compose restart postgres`

**Missing test data:**
- Re-run seed: `npm run db:seed`

**Environment variables:**
- Verify `.env` file exists and has all required variables
- Run verification: `npm run verify`

**Prisma client issues:**
- Regenerate client: `npm run db:generate`

## Setup (Production)

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (copy `.env.example` to `.env`):
```env
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REDIRECT_URI=http://localhost:3000/api/oauth/gmail/callback
OPENAI_API_KEY=sk-...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
ENCRYPTION_KEY=...
```

3. Set up database:
```bash
npx prisma generate
npx prisma db push
```

4. Run development server:
```bash
npm run dev
```

5. Run Inngest dev server (in another terminal):
```bash
npx inngest-cli@latest dev
```

## Project Structure

- `app/` - Next.js app router pages and API routes
- `lib/` - Core services and utilities
- `lib/services/` - Business logic services
- `inngest/` - Background job functions
- `components/` - React components
- `prisma/` - Database schema

## Key Workflows

### Natural Language Email Composition
1. User enters prompt: "send email to my employees asking for expense reports"
2. AI generates draft (subject, body, suggested recipients)
3. User reviews and edits draft
4. User approves and sends → Email sent, Task created

### Inbound Email Processing
1. Email received via Gmail webhook or IMAP polling
2. Thread ID extracted from reply-to address
3. Task found and updated (status: REPLIED or HAS_ATTACHMENTS)
4. AI classifies message
5. If attachments, AI verifies document
6. Automation rules executed

## API Endpoints

- `POST /api/email-drafts/generate` - Generate email draft from prompt
- `GET /api/email-drafts/[id]` - Get draft
- `POST /api/email-drafts/[id]/send` - Send email draft
- `GET /api/tasks` - List tasks
- `GET /api/tasks/[id]` - Get task details
- `POST /api/tasks/[id]/reply` - Send manual reply
- `GET /api/oauth/gmail` - Initiate Gmail OAuth
- `POST /api/webhooks/gmail` - Gmail push notification webhook
- `POST /api/inngest` - Inngest webhook

## Database Models

- `Organization` - Multi-tenant organizations
- `User` - Users with roles (ADMIN, MEMBER, VIEWER)
- `Entity` - People/organizations (clients, vendors, employees)
- `Group` - Entity groups/categories
- `Campaign` - Email campaigns (W-9, COI, Expense, etc.)
- `Task` - Email response tracking tasks
- `Message` - Inbound/outbound email logs
- `AgentSchedule` - CRON-based recurring emails
- `ConnectedEmailAccount` - Gmail/SMTP connections
- `AutomationRule` - AI automation rules
- `EmailDraft` - Generated email drafts

## Development Scripts

- `npm run dev` - Start Next.js development server
- `npm run setup:env` - Generate `.env` file with secure secrets
- `npm run setup:db` - Set up database (Docker + migrations + seed)
- `npm run verify` - Verify local setup is correct
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push database schema changes
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with test data
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm run dev:full` - Start Docker + Next.js dev server

## License

Private

