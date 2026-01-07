# Google Cloud Deployment Guide

Complete guide for deploying Vergo Inbox to Google Cloud Run with Cloud SQL PostgreSQL.

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Google Cloud SDK** (`gcloud`) installed and authenticated
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
3. **Inngest Account** (free tier available at https://inngest.com)
4. **Gmail OAuth Credentials** configured in Google Cloud Console

## Step 1: Google Cloud Project Setup

### Create or Select Project

```bash
# Create new project
gcloud projects create vergo-inbox --name="Vergo Inbox"

# Or select existing project
gcloud config set project YOUR_PROJECT_ID
```

### Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com
```

### Set Up Billing

Billing is required for Cloud SQL. Enable it in the [Google Cloud Console](https://console.cloud.google.com/billing).

## Step 2: Create Cloud SQL PostgreSQL Instance

### Create Instance

```bash
gcloud sql instances create vergo-inbox-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_SECURE_PASSWORD
```

**Note:** Replace `YOUR_SECURE_PASSWORD` with a strong password. Save this password securely.

### Create Database

```bash
gcloud sql databases create vergo_inbox --instance=vergo-inbox-db
```

### Create Database User

```bash
gcloud sql users create vergo_user \
  --instance=vergo-inbox-db \
  --password=YOUR_USER_PASSWORD
```

**Note:** Replace `YOUR_USER_PASSWORD` with a strong password. This will be used in the DATABASE_URL.

### Get Connection Name

```bash
gcloud sql instances describe vergo-inbox-db --format="value(connectionName)"
```

Save this connection name (format: `PROJECT_ID:REGION:INSTANCE_NAME`) - you'll need it for Cloud Run connection.

## Step 3: Set Up Google Cloud Secret Manager

### Create Secrets

Create all required secrets in Secret Manager:

```bash
# Database URL (use Cloud SQL connection format)
echo -n "postgresql://vergo_user:YOUR_USER_PASSWORD@/vergo_inbox?host=/cloudsql/PROJECT_ID:us-central1:vergo-inbox-db" | \
  gcloud secrets create DATABASE_URL --data-file=-

# NextAuth Secret (generate with: openssl rand -base64 32)
echo -n "your-nextauth-secret" | \
  gcloud secrets create NEXTAUTH_SECRET --data-file=-

# OpenAI API Key
echo -n "sk-your-openai-api-key" | \
  gcloud secrets create OPENAI_API_KEY --data-file=-

# Encryption Key (generate with: openssl rand -base64 32)
echo -n "your-encryption-key" | \
  gcloud secrets create ENCRYPTION_KEY --data-file=-

# Gmail OAuth Credentials
echo -n "your-gmail-client-id" | \
  gcloud secrets create GMAIL_CLIENT_ID --data-file=-

echo -n "your-gmail-client-secret" | \
  gcloud secrets create GMAIL_CLIENT_SECRET --data-file=-

# Inngest Secrets (optional but recommended for production)
echo -n "your-inngest-event-key" | \
  gcloud secrets create INNGEST_EVENT_KEY --data-file=-

echo -n "your-inngest-signing-key" | \
  gcloud secrets create INNGEST_SIGNING_KEY --data-file=-
```

### Grant Cloud Run Access to Secrets

```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Repeat for all secrets
for secret in NEXTAUTH_SECRET OPENAI_API_KEY ENCRYPTION_KEY GMAIL_CLIENT_ID GMAIL_CLIENT_SECRET INNGEST_EVENT_KEY INNGEST_SIGNING_KEY; do
  gcloud secrets add-iam-policy-binding ${secret} \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

## Step 4: Deploy to Cloud Run

### Update Deployment Script

Edit `scripts/deploy-cloud-run.sh` and set:
- `PROJECT_ID` to your Google Cloud project ID
- `REGION` if different from `us-central1`

### Run Deployment

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export REGION=us-central1
./scripts/deploy-cloud-run.sh
```

Or manually:

```bash
PROJECT_ID="your-project-id"
REGION="us-central1"
SERVICE_NAME="vergo-inbox"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Build and push
gcloud builds submit --tag ${IMAGE_NAME}

# Deploy
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --add-cloudsql-instances ${PROJECT_ID}:${REGION}:vergo-inbox-db \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,NEXTAUTH_SECRET=NEXTAUTH_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,GMAIL_CLIENT_ID=GMAIL_CLIENT_ID:latest,GMAIL_CLIENT_SECRET=GMAIL_CLIENT_SECRET:latest,INNGEST_EVENT_KEY=INNGEST_EVENT_KEY:latest,INNGEST_SIGNING_KEY=INNGEST_SIGNING_KEY:latest"
```

### Get Service URL

After deployment, get your service URL:

```bash
gcloud run services describe vergo-inbox --region=us-central1 --format="value(status.url)"
```

Save this URL - you'll need it for the next steps.

## Step 5: Configure Environment Variables

### Update NEXTAUTH_URL

Set `NEXTAUTH_URL` to your Cloud Run service URL:

```bash
SERVICE_URL=$(gcloud run services describe vergo-inbox --region=us-central1 --format="value(status.url)")

gcloud run services update vergo-inbox \
  --region=us-central1 \
  --update-env-vars "NEXTAUTH_URL=${SERVICE_URL},TRACKING_BASE_URL=${SERVICE_URL}"
```

## Step 6: Run Database Migrations

### Option A: Using Cloud SQL Proxy (Recommended for Local)

1. **Install Cloud SQL Proxy:**
   ```bash
   # macOS
   curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.arm64
   chmod +x cloud-sql-proxy
   
   # Or use Homebrew
   brew install cloud-sql-proxy
   ```

2. **Start Cloud SQL Proxy:**
   ```bash
   ./cloud-sql-proxy PROJECT_ID:us-central1:vergo-inbox-db
   ```

3. **In another terminal, set DATABASE_URL:**
   ```bash
   export DATABASE_URL="postgresql://vergo_user:YOUR_USER_PASSWORD@127.0.0.1:5432/vergo_inbox"
   npx prisma db push
   ```

### Option B: Using Migration Script

Update `scripts/migrate-production.sh` with your Cloud SQL connection string, then run:

```bash
./scripts/migrate-production.sh
```

## Step 7: Update Gmail OAuth Redirect URI

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Add authorized redirect URI:
   ```
   https://YOUR-SERVICE-URL.run.app/api/oauth/gmail/callback
   ```
4. Add authorized JavaScript origin:
   ```
   https://YOUR-SERVICE-URL.run.app
   ```
5. Save changes

## Step 8: Configure Inngest

1. Go to [Inngest Dashboard](https://app.inngest.com)
2. Create a new app or select existing
3. Add your Cloud Run service URL as the sync endpoint:
   ```
   https://YOUR-SERVICE-URL.run.app/api/inngest
   ```
4. Copy the Event Key and Signing Key
5. Update secrets in Google Cloud Secret Manager:
   ```bash
   echo -n "your-inngest-event-key" | \
     gcloud secrets versions add INNGEST_EVENT_KEY --data-file=-
   
   echo -n "your-inngest-signing-key" | \
     gcloud secrets versions add INNGEST_SIGNING_KEY --data-file=-
   ```
6. Redeploy Cloud Run service to pick up new secrets

## Step 9: Verify Deployment

### Check Service Status

```bash
gcloud run services describe vergo-inbox --region=us-central1
```

### View Logs

```bash
gcloud run services logs read vergo-inbox --region=us-central1 --limit=50
```

### Test Application

1. Visit your Cloud Run service URL
2. Sign in with test credentials
3. Test email sending
4. Verify tracking pixel works (check "Read" tab)
5. Test Inngest functions (send email draft, etc.)

## Environment Variables Reference

### Required Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Cloud SQL connection string | `postgresql://user:pass@/db?host=/cloudsql/PROJECT:REGION:INSTANCE` |
| `NEXTAUTH_SECRET` | Random secret for NextAuth | Generated with `openssl rand -base64 32` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `ENCRYPTION_KEY` | Encryption key for sensitive data | Generated with `openssl rand -base64 32` |

### Optional Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| `GMAIL_CLIENT_ID` | Gmail OAuth client ID | From Google Cloud Console |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth client secret | From Google Cloud Console |
| `INNGEST_EVENT_KEY` | Inngest event key | From Inngest Dashboard |
| `INNGEST_SIGNING_KEY` | Inngest signing key | From Inngest Dashboard |

### Environment Variables (Set Directly)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `NEXTAUTH_URL` | Public URL of your service | `https://vergo-inbox-xxx.run.app` |
| `TRACKING_BASE_URL` | URL for tracking pixels | `https://vergo-inbox-xxx.run.app` (defaults to NEXTAUTH_URL) |

## Cost Estimation

- **Cloud Run:** Pay per request
  - Free tier: 2 million requests/month
  - After free tier: ~$0.40 per million requests
- **Cloud SQL (db-f1-micro):** ~$7-10/month
- **Cloud Build:** Free tier: 120 build-minutes/day
- **Secret Manager:** Free tier: 6 secrets, 10,000 access operations/month

**Estimated total for low traffic:** ~$10-15/month

## Troubleshooting

### Service Won't Start

**Check logs:**
```bash
gcloud run services logs read vergo-inbox --region=us-central1
```

**Common issues:**
- Missing secrets: Verify all secrets exist in Secret Manager
- Database connection: Check DATABASE_URL format and Cloud SQL instance status
- Port binding: Ensure app listens on `0.0.0.0:3000` (handled by Dockerfile)

### Database Connection Errors

**Verify Cloud SQL instance:**
```bash
gcloud sql instances describe vergo-inbox-db
```

**Check connection name format:**
```
PROJECT_ID:REGION:INSTANCE_NAME
```

**Test connection with Cloud SQL Proxy:**
```bash
./cloud-sql-proxy PROJECT_ID:us-central1:vergo-inbox-db
# Then connect: psql "postgresql://user:pass@127.0.0.1:5432/vergo_inbox"
```

### Tracking Pixel Not Working

**Verify TRACKING_BASE_URL:**
```bash
gcloud run services describe vergo-inbox --region=us-central1 --format="yaml(spec.template.spec.containers[0].env)"
```

**Test tracking URL manually:**
```bash
curl https://YOUR-SERVICE-URL.run.app/api/tracking/TEST_TOKEN
```

**Check CORS headers** (should allow all origins for tracking pixels)

### Inngest Functions Not Executing

**Verify webhook URL in Inngest dashboard:**
```
https://YOUR-SERVICE-URL.run.app/api/inngest
```

**Check Inngest secrets:**
```bash
gcloud secrets versions access latest --secret=INNGEST_EVENT_KEY
gcloud secrets versions access latest --secret=INNGEST_SIGNING_KEY
```

**View Inngest logs in dashboard** for function execution errors

### Gmail OAuth Not Working

**Verify redirect URI:**
- Must match exactly: `https://YOUR-SERVICE-URL.run.app/api/oauth/gmail/callback`
- Check in Google Cloud Console > APIs & Services > Credentials

**Check Gmail secrets:**
```bash
gcloud secrets versions access latest --secret=GMAIL_CLIENT_ID
gcloud secrets versions access latest --secret=GMAIL_CLIENT_SECRET
```

## Rollback Plan

If deployment fails:

1. **List revisions:**
   ```bash
   gcloud run revisions list --service=vergo-inbox --region=us-central1
   ```

2. **Rollback to previous revision:**
   ```bash
   gcloud run services update-traffic vergo-inbox \
     --to-revisions=PREVIOUS_REVISION=100 \
     --region=us-central1
   ```

3. **Fix issues and redeploy**

## Security Best Practices

1. **Secrets Management:**
   - Never commit secrets to git
   - Use Secret Manager for all sensitive data
   - Rotate secrets regularly

2. **Database Security:**
   - Use Cloud SQL private IP (default with Cloud Run)
   - Restrict database user permissions
   - Enable SSL connections (Cloud SQL default)

3. **Network Security:**
   - HTTPS enforced by Cloud Run
   - Consider VPC connector for additional network isolation
   - Use IAM for access control

4. **Application Security:**
   - Keep dependencies updated
   - Use environment-specific configurations
   - Monitor logs for suspicious activity

## Maintenance

### Update Secrets

```bash
# Update a secret
echo -n "new-secret-value" | \
  gcloud secrets versions add SECRET_NAME --data-file=-

# Redeploy to pick up new secret version
gcloud run services update vergo-inbox --region=us-central1
```

### Update Application

#### Option A: Manual Deployment

```bash
# Rebuild and redeploy
./scripts/deploy-cloud-run.sh
```

#### Option B: Automatic Deployments (Recommended)

Set up automatic builds that trigger on code pushes:

```bash
# Run the setup script to configure IAM permissions
./scripts/setup-cloud-build-trigger.sh
```

Then create a Cloud Build trigger:

1. **Connect your repository** (if not already connected):
   - Go to: [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
   - Click "Connect Repository"
   - Select your Git provider (GitHub, GitLab, Bitbucket, etc.)
   - Authorize and select your repository

2. **Create a trigger**:
   - Click "Create Trigger"
   - Name: `deploy-vergo-inbox`
   - Event: "Push to a branch" (or "Pull request" if preferred)
   - Source: Select your repository and branch (e.g., `main` or `master`)
   - Configuration: "Cloud Build configuration file (yaml or json)"
   - Location: `cloudbuild.yaml` (root of repository)
   - Substitution variables (optional):
     - `_REGION`: `us-central1`
   - Click "Create"

3. **Test the trigger**:
   - Push a commit to your repository
   - Check the build status in Cloud Build console

Once set up, every push to your main branch will automatically trigger a build and deployment!

### Database Backups

Cloud SQL automatically creates daily backups. To create manual backup:

```bash
gcloud sql backups create --instance=vergo-inbox-db
```

### Monitor Costs

```bash
# View Cloud Run costs
gcloud billing accounts list
gcloud billing projects describe YOUR_PROJECT_ID

# Set up budget alerts in Google Cloud Console
```

## Support

For issues:
1. Check logs: `gcloud run services logs read vergo-inbox --region=us-central1`
2. Review this troubleshooting guide
3. Check Google Cloud status: https://status.cloud.google.com
4. Review Inngest status: https://status.inngest.com


