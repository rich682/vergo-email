# Gmail OAuth Setup Guide

The error "401: invalid_client" means your Gmail OAuth credentials are not configured. Follow these steps to set up Gmail OAuth:

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "Vergo Inbox")
5. Click "Create"

## Step 2: Enable Gmail API

1. In your project, go to **APIs & Services** > **Library**
2. Search for "Gmail API"
3. Click on "Gmail API"
4. Click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen first:
   - Choose "External" (unless you have a Google Workspace)
   - Fill in required fields:
     - App name: "Vergo Inbox"
     - User support email: Your email
     - Developer contact: Your email
   - Click "Save and Continue"
   - Add scopes (optional for now, click "Save and Continue")
   - Add test users (your Gmail address) if in testing mode
   - Click "Save and Continue"
   - Review and click "Back to Dashboard"

4. Now create OAuth client ID:
   - Application type: **Web application**
   - Name: "Vergo Inbox Local"
   - **Authorized JavaScript origins:**
     ```
     http://localhost:3000
     ```
     (Click "+ Add URI" and enter the above)
   - **Authorized redirect URIs:**
     ```
     http://localhost:3000/api/oauth/gmail/callback
     ```
     (Click "+ Add URI" and enter the above)
   - Click "Create"

5. **Copy your credentials:**
   - You'll see a popup with:
     - **Client ID** (looks like: `123456789-abc...xyz.apps.googleusercontent.com`)
     - **Client secret** (looks like: `GOCSPX-abc...xyz`)
   - Keep this window open or copy these values

## Step 4: Update Your .env File

1. Open your `.env` file in the project root
2. Replace the placeholder values with your actual credentials:

```env
GMAIL_CLIENT_ID=your-actual-client-id-here
GMAIL_CLIENT_SECRET=your-actual-client-secret-here
GMAIL_REDIRECT_URI=http://localhost:3000/api/oauth/gmail/callback
```

**Important:** 
- Remove any quotes around the values
- Don't include spaces
- Make sure the redirect URI matches exactly what you entered in Google Cloud Console

## Step 5: Restart Your Server

After updating `.env`, restart your Next.js server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## Step 6: Test the Connection

1. Go to http://localhost:3000/dashboard/settings
2. Click "Connect Gmail"
3. You should be redirected to Google's consent screen
4. Sign in with your Gmail account
5. Grant the requested permissions
6. You should be redirected back to the settings page with a success message

## Troubleshooting

**Still getting "invalid_client" error:**
- Double-check that `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in `.env` match exactly what Google Cloud Console shows
- Make sure there are no extra spaces or quotes
- Verify the redirect URI in Google Cloud Console matches: `http://localhost:3000/api/oauth/gmail/callback`
- **Make sure you added the JavaScript origin:** `http://localhost:3000` in the "Authorized JavaScript origins" section

**"Redirect URI mismatch" error:**
- The redirect URI in Google Cloud Console must match exactly: `http://localhost:3000/api/oauth/gmail/callback`
- Check for typos, trailing slashes, or protocol differences (http vs https)

**"Access blocked" error:**
- If your app is in testing mode, make sure your Gmail address is added as a test user in the OAuth consent screen
- Go to **APIs & Services** > **OAuth consent screen** > **Test users** > Add your email

**Need to reset credentials:**
- Delete the OAuth client in Google Cloud Console
- Create a new one following the steps above
- Update your `.env` file with the new credentials

## Production Setup

For production, you'll need to:
1. Publish your OAuth app (go through Google's verification process)
2. Update the redirect URI to your production domain
3. Update `GMAIL_REDIRECT_URI` in your production `.env` file

