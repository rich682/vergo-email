# Quick Setup Guide

## First Time Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate environment file:**
   ```bash
   npm run setup:env
   ```
   This creates a `.env` file with secure random secrets. Your OpenAI API key is already included.

3. **Start database and seed test data:**
   ```bash
   npm run setup:db
   ```
   This will:
   - Start PostgreSQL in Docker
   - Create database schema
   - Seed test data (users, entities, groups, campaigns)

4. **Verify everything is set up correctly:**
   ```bash
   npm run verify
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **In a separate terminal, start Inngest dev server:**
   ```bash
   npx inngest-cli@latest dev
   ```

7. **Open your browser:**
   - Go to http://localhost:3000
   - Sign in with: `admin@test.com` / `test123`

## Test Users

- **Admin**: `admin@test.com` / `test123` (full access)
- **Member**: `member@test.com` / `test123` (standard access)
- **Viewer**: `viewer@test.com` / `test123` (read-only access)

## What's Included in Seed Data

- **Organization**: Test Accounting Firm
- **Users**: 3 test users (admin, member, viewer)
- **Entities**: 6 sample entities (2 employees, 2 vendors, 2 clients)
- **Groups**: 3 groups (Employees, Vendors, Clients)
- **Campaigns**: 3 campaigns (W-9 Collection, Expense Reports, COI)

## Gmail OAuth (Optional)

To test email sending with Gmail:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add redirect URI: `http://localhost:3000/api/oauth/gmail/callback`
4. Update `.env` with `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`

## Troubleshooting

**Database won't start:**
```bash
docker-compose up -d postgres
docker-compose ps  # Check if running
```

**Need to reset database:**
```bash
docker-compose down -v  # Removes volumes
npm run setup:db        # Recreates everything
```

**Environment variables missing:**
```bash
npm run setup:env  # Regenerate .env file
```

**Prisma client issues:**
```bash
npm run db:generate
```

## Next Steps

1. Sign in with test user
2. Try composing an email using natural language
3. Explore the dashboard and task management
4. Connect Gmail account (optional) to test email sending






