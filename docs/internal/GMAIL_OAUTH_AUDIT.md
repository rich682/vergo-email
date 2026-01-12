# Gmail OAuth Setup Audit

## Current OAuth Scopes ✅

We're requesting these scopes in `app/api/oauth/gmail/route.ts`:

1. ✅ `https://www.googleapis.com/auth/gmail.send` - **Can send emails**
2. ✅ `https://www.googleapis.com/auth/gmail.readonly` - **Can read emails (including replies)**
3. ✅ `https://www.googleapis.com/auth/gmail.modify` - **Can read and modify emails (includes read + send)**
4. ✅ `https://www.googleapis.com/auth/userinfo.email` - **Can get user email**

**Status: GOOD** - These scopes are sufficient for reading replies. Note: `gmail.modify` already includes read access, so `gmail.readonly` is redundant but harmless.

## Critical Gaps Found ❌

### Gap 1: Gmail Watch (Push Notifications) Not Set Up

**Issue:** The `GmailWatchService` exists but is **never called** after OAuth connection.

**Location:** `lib/services/gmail-watch.service.ts` exists but is not invoked in:
- ❌ OAuth callback (`app/api/oauth/gmail/callback/route.ts`)
- ❌ Email connection service (`lib/services/email-connection.service.ts`)
- ❌ Anywhere else in the codebase

**Impact:** Push notifications are not configured, so replies are not automatically detected.

**Fix Required:**
1. Call `GmailWatchService.setupWatch()` after successful OAuth connection
2. Handle cases where Pub/Sub is not configured (make it optional)
3. Store watch expiration date for renewal

### Gap 2: Pub/Sub Topic Not Configured

**Issue:** Gmail watch requires Google Cloud Pub/Sub topic, which likely isn't configured.

**Requirements:**
- `GMAIL_PUBSUB_TOPIC` env var OR
- `GOOGLE_CLOUD_PROJECT` env var (will construct topic path)

**Additional Setup Needed:**
1. Create Pub/Sub topic in Google Cloud Console
2. Grant Gmail API service account permission to publish
3. Set up webhook endpoint to receive Pub/Sub messages (already exists at `/api/webhooks/gmail`)

**Impact:** Even if watch was set up, it would fail without Pub/Sub configuration.

### Gap 3: Watch Expiration Not Handled

**Issue:** Gmail watch subscriptions expire after 7 days and need renewal.

**Current Code:** The expiration is fetched but not stored or used for renewal.

**Fix Required:** Store expiration and set up scheduled renewal (via Inngest or cron).

### Gap 4: Label Limitation

**Issue:** Watch is configured to only monitor `["INBOX"]` label.

**Potential Problem:** If replies go to different folders (e.g., if user has filters), they won't be detected.

**Consideration:** For most users, INBOX is sufficient, but enterprise users might have complex filters.

### Gap 5: Sync Service Limitation

**Current Implementation:** `EmailSyncService` only checks threads where we've sent messages.

**Potential Gap:** If a user replies from a different email client/account, or if thread ID matching fails, sync won't catch it.

**Mitigation:** This is acceptable as a fallback since we're primarily tracking replies to our outbound emails.

## Status After Fixes ✅

### Fixed: Gmail Watch Now Attempts Setup
**Location:** `app/api/oauth/gmail/callback/route.ts` (lines 103-112)

**Change:** After successful OAuth connection, we now:
- Attempt to set up Gmail watch automatically
- If Pub/Sub is not configured, log warning but don't fail connection
- Sync service remains as fallback

**Result:** Watch will be set up if Pub/Sub is configured, otherwise sync service handles replies.

## Recommendations

### Immediate Fixes (High Priority):

1. ✅ **Make Watch Setup Optional but Attempted:** - **COMPLETED**
   - Try to set up watch after OAuth ✅
   - If Pub/Sub not configured, log warning but don't fail ✅
   - Continue with sync service as fallback ✅

2. **Auto-trigger Sync Periodically:**
   - Set up Inngest scheduled job to run `EmailSyncService` every 5-10 minutes
   - This ensures replies are caught even without push notifications

3. **Improve Sync Service:**
   - Add query parameter to check for messages with `is:unread` or recent date filter
   - This catches replies even if they're not in tracked threads

### Medium Priority:

4. **Add Manual "Check for Replies" Button:**
   - UI button to trigger sync manually
   - Useful for immediate testing

5. **Store Watch Expiration:**
   - Store expiration in database
   - Set up renewal before expiration

### Low Priority (Nice to Have):

6. **Support Multiple Labels:**
   - Allow configuration of which labels to watch
   - Default to INBOX but allow customization

7. **Pub/Sub Webhook Verification:**
   - Verify Pub/Sub messages are actually reaching our webhook
   - Add monitoring/logging

