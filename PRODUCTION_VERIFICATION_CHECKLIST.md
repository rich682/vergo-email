# Production Reply Capture Verification Checklist

## A) Verify Production Deployment (Vercel)

**Steps:**
1. Go to Vercel dashboard → Your project → Deployments
2. Find commit `dc2faf2` in the list
3. Check deployment status (Ready/Failed/Building)
4. If not found, identify latest deployed commit SHA

**Record:**
- deployed_commit_sha: `dc2faf2` or `[latest SHA]`
- deploy_status: `success` or `fail`
- notes: `[any build errors or warnings]`

---

## B) Apply Production Schema (DB Push)

**Steps:**
1. Connect to production environment (Vercel CLI or SSH)
2. Ensure `DATABASE_URL` is set
3. Run: `npx prisma db push`
4. Verify columns exist (run in production DB or Prisma Studio):
   ```sql
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'Message' 
   AND column_name IN ('messageIdHeader', 'threadId');
   ```

**Record:**
- db_push: `success` or `fail`
- messageIdHeader: `true` or `false`
- threadId: `true` or `false`

---

## C) Verify Ingestion via Manual Sync Endpoint

**Steps:**
1. Authenticate as admin (get session token)
2. Call: `POST https://your-domain.com/api/admin/sync-gmail-now`
   ```bash
   curl -X POST https://your-domain.com/api/admin/sync-gmail-now \
     -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
     -H "Content-Type: application/json"
   ```
3. Record JSON response

**Record (Sync #1):**
- accountsProcessed: `[number]`
- messagesFetched: `[number]`
- repliesPersisted: `[number]`
- errors: `[number]`

**If accountsProcessed == 0 or errors > 0:**
- Check logs for account sync errors
- Verify Gmail OAuth tokens are valid
- Verify `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` are set (if using Inngest)

---

## D) End-to-End Reply Test

**Steps:**
1. From app UI: Create a new Request, send email to your own inbox
2. Reply to that email with: "We will pay invoice INV-123 on Friday."
3. Wait 1-2 minutes (or call sync immediately)
4. Call: `POST /api/admin/sync-gmail-now` again
5. Check production logs (Vercel logs or your log aggregator) for these JSON events:

**Expected log sequence:**
```json
{"event":"inbound_message_fetched","timestampMs":...,"threadId":"...","messageIdHeader":"..."}
{"event":"reply_linked","requestId":"...","method":"in_reply_to_header","messageIdHeader":"..."}
{"event":"reply_ingested","requestId":"...","riskRecomputeInvoked":true}
```

**If reply_link_failed appears:**
```json
{"event":"reply_link_failed","reason":"no_matching_outbound_message","identifiers_present":{"inReplyTo":true,"threadId":true,"subject":true}}
```

**Record (Sync #2):**
- accountsProcessed: `[number]`
- messagesFetched: `[number]`
- repliesPersisted: `[number]` (should be > 0 if reply was found)
- errors: `[number]`

**Record (Logs):**
- reply_linked: `true` or `false`
- method: `in_reply_to_header` or `thread_id` or `subject_pattern` or `none`
- reply_link_failed_reason: `[reason from logs if failed]` or `""`

---

## E) UI Confirmation

**Steps:**
1. Open: `https://your-domain.com/dashboard/requests/[request-key]`
2. Find the recipient row for your test email
3. Check:
   - Status shows "Replied" (not "Unread" or "Read")
   - Response snippet/body is visible in the recipient row
   - Risk level updated (if RAG is working) or at least reply is visible

**Record:**
- replied_visible: `true` or `false`
- snippet_visible: `true` or `false`
- rag_updated: `true` or `false` (or `unknown` if RAG not yet implemented)

---

## Troubleshooting

**If reply_link_failed:**
1. Check outbound Message row for that request:
   ```sql
   SELECT "messageIdHeader", "threadId", "providerData" 
   FROM "Message" 
   WHERE "taskId" = '[your-task-id]' 
   AND "direction" = 'OUTBOUND';
   ```
2. If `messageIdHeader` or `threadId` are NULL:
   - This is a pre-deployment send (expected)
   - Verify new sends populate these fields
   - Consider backfill if needed

**If accountsProcessed == 0:**
- Check Gmail OAuth connection is active
- Verify `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` are set
- Check logs for OAuth token refresh errors

**If repliesPersisted == 0 but messagesFetched > 0:**
- Check logs for `reply_link_failed` events
- Verify outbound messages have `messageIdHeader`/`threadId` populated
- Check matching logic is working (should use indexed columns now)

---

## Final Results Template

Copy this and fill in:

```
- Deploy: { deployed_commit_sha: "...", status: "success|fail", notes: "..." }
- DB: { db_push: "success|fail", messageIdHeader: true/false, threadId: true/false }
- Sync #1: { accountsProcessed: N, messagesFetched: N, repliesPersisted: N, errors: N }
- Sync #2: { accountsProcessed: N, messagesFetched: N, repliesPersisted: N, errors: N }
- Logs: { reply_linked: true/false, method: "in_reply_to_header|thread_id|subject_pattern|none", reply_link_failed_reason: "..." }
- UI: { replied_visible: true/false, snippet_visible: true/false, rag_updated: true/false }
```


