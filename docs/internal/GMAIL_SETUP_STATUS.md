# Gmail OAuth Setup Status & Verification

## ✅ OAuth Scopes - **GOOD**

**Current scopes requested** (`app/api/oauth/gmail/route.ts` lines 22-27):
- ✅ `https://www.googleapis.com/auth/gmail.send` - Can send emails
- ✅ `https://www.googleapis.com/auth/gmail.readonly` - Can read emails (including replies)
- ✅ `https://www.googleapis.com/auth/gmail.modify` - Can read and modify emails (includes read + send)
- ✅ `https://www.googleapis.com/auth/userinfo.email` - Can get user email

**Verdict:** ✅ **These scopes are sufficient for reading replies.** The `gmail.modify` scope includes all read permissions, so we have full access to read incoming emails and replies.

---

## ⚠️ Gmail Push Notifications (Watch) - **PARTIALLY WORKING**

### What Works:
- ✅ Watch service code exists (`lib/services/gmail-watch.service.ts`)
- ✅ Watch is now automatically attempted after OAuth connection (fixed)
- ✅ If watch fails, connection still succeeds (graceful fallback)

### What's Missing:
- ❌ **Pub/Sub Topic Not Configured** - This is likely the main blocker

**Required Setup:**
1. Create Google Cloud Pub/Sub topic
2. Set environment variable: `GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT/topics/gmail-notifications`
   OR set: `GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID`
3. Grant Gmail API permission to publish to the topic
4. Configure Pub/Sub to send messages to your webhook endpoint (`/api/webhooks/gmail`)

**Current Status:** Watch will fail silently if Pub/Sub isn't configured, but this is handled gracefully - sync service will still work.

---

## ✅ Sync Service (Polling Fallback) - **WORKING**

**Location:** `lib/services/email-sync.service.ts`

**How it works:**
1. Finds all Gmail threads where we've sent emails (using stored Gmail thread IDs)
2. Checks each thread for new messages we haven't processed
3. Filters out our own outbound messages
4. Processes any new inbound messages through the normal pipeline

**Limitations:**
- Only checks threads we've sent to (this is fine for our use case)
- Manual trigger required (via `/api/admin/sync-emails` endpoint)
- Not automatically scheduled (would need Inngest job)

**Verdict:** ✅ **This works as a reliable fallback** even when push notifications aren't configured.

---

## 🔍 How to Verify Your Setup

### 1. Check OAuth Scopes (After connecting Gmail)

The scopes are automatically requested during OAuth. To verify:
1. Go to Google Account: https://myaccount.google.com/permissions
2. Find "Vergo Inbox" or your app name
3. Verify it shows: "View, read, compose, send, and permanently delete email"

### 2. Check if Push Notifications Work

**Signs that push notifications are working:**
- Replies appear in the app within seconds
- You see `[Gmail OAuth] Successfully set up watch` in logs

**Signs that push notifications are NOT working:**
- Replies don't appear automatically
- You see `[Gmail OAuth] Could not set up watch` warning in logs
- Need to manually trigger sync to see replies

### 3. Test Sync Service (Fallback)

**Manual trigger via browser console:**
```javascript
fetch('/api/admin/sync-emails', { method: 'POST' })
  .then(r => r.json())
  .then(data => console.log('Sync result:', data))
```

**Expected result:**
- `processed: X` - Number of new messages found and processed
- `errors: 0` - Should be 0 if working correctly

---

## 📋 Action Items

### Critical (Needed for automatic reply detection):
1. **Set up Google Cloud Pub/Sub** (for push notifications)
   - OR rely on sync service as fallback (requires manual/scheduled triggering)

### Recommended (Better user experience):
2. **Schedule automatic sync** (via Inngest)
   - Set up Inngest job to call `EmailSyncService.syncGmailAccounts()` every 5-10 minutes
   - This ensures replies are caught even without push notifications

### Optional (Nice to have):
3. **Store watch expiration** and renew automatically
4. **Add UI button** to manually trigger sync
5. **Support multiple labels** beyond just INBOX

---

## 🎯 Current State Summary

| Feature | Status | Notes |
|---------|--------|-------|
| **OAuth Scopes** | ✅ GOOD | All necessary permissions granted |
| **Read Access** | ✅ WORKING | Can read emails via API |
| **Send Access** | ✅ WORKING | Can send emails via API |
| **Push Notifications** | ⚠️ PARTIAL | Requires Pub/Sub setup (likely missing) |
| **Sync Service** | ✅ WORKING | Reliable fallback, manual trigger needed |
| **Auto Sync** | ❌ NOT SET | Would need Inngest scheduled job |

---

## ✅ Conclusion

**Your Gmail OAuth setup allows access to replies** - the scopes are correct and sufficient.

**The main gap is:** Push notifications (Gmail Watch) require Pub/Sub configuration, which is likely not set up. However, the sync service provides a reliable fallback that will catch replies when manually triggered.

**For immediate use:** Use the `/api/admin/sync-emails` endpoint to manually check for replies until push notifications are configured or auto-sync is set up.


