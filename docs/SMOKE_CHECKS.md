# RAG Pipeline Smoke Checks

Manual verification checklist for the Requests RAG (Risk Assessment Grade) pipeline.

## Pipeline Status Endpoint

**Endpoint:** `GET /api/admin/pipeline-status`

**Authentication:** Required (admin session)

**Expected "ok" response:**
```json
{
  "status": "ok",
  "checks": {
    "canWriteDb": true,
    "gmailIntegrationConfigured": true,
    "openTrackingConfigured": true,
    "replyIngestionConfigured": true,
    "ragClassifierConfigured": true
  },
  "lastSeen": {
    "lastOpenEventAt": "2026-01-10T21:00:00.000Z",
    "lastReplyEventAt": "2026-01-10T21:05:00.000Z",
    "lastRagUpdateAt": "2026-01-10T21:05:30.000Z"
  },
  "timestamp": "2026-01-10T21:30:00.000Z"
}
```

**"degraded" status means:** One or more checks failed (missing env vars, DB unavailable, etc.)

## 5-Step Manual Verification Flow

### 1. Send Request to Yourself
- Navigate to Checklist (`/dashboard/jobs`)
- Open an item with stakeholders
- Click "Send Request" to open the modal
- Send the request to your own email address
- Verify the email is received

**Expected:** Email sent successfully, request appears under the Item

### 2. Open the Email
- Open the sent email in your email client
- Verify the tracking pixel is loaded (check network tab or email client)

**Expected:** Within 1-2 minutes, task shows "read" status in Requests list

**Check logs for:**
```
{"event":"open_ingested","requestId":"task-id","recipientHash":"abc123...","timestampMs":1234567890,"result":{"riskLevel":"high","readStatus":"read"}}
```

### 3. Reply to the Email
- Reply to the sent email from your email client
- Include some text in the reply (e.g., "I'll pay this invoice next week")

**Expected:** Within 1-2 minutes, reply appears in Requests detail view

**Check logs for:**
```
{"event":"reply_ingested","requestId":"task-id","recipientHash":"abc123...","timestampMs":1234567890,"result":{"riskLevel":"medium","readStatus":"replied"}}
```

### 4. Verify RAG Classification
- Check the Item detail view for the sent request
- Verify risk level is computed (High/Medium/Low)
- Verify read status is "replied"

**Expected:** Risk level reflects reply intent (e.g., "I'll pay next week" → Medium risk)

**Check logs for:**
```
{"event":"rag_computed","requestId":"task-id","recipientHash":"abc123...","timestampMs":1234567890,"result":{"riskLevel":"medium","readStatus":"replied"},"method":"llm"}
```

### 5. Verify Pipeline Status Endpoint
- Call `GET /api/admin/pipeline-status` (while authenticated)
- Verify all checks are `true`
- Verify `lastSeen` timestamps are recent (within last hour)

**Expected:** All checks pass, timestamps are current

## Troubleshooting

- **No open events:** Check `TRACKING_BASE_URL` or `NEXTAUTH_URL` is set correctly
- **No reply events:** Check Gmail integration (webhook) or sync service (polling) is configured
- **No RAG updates:** Check `OPENAI_API_KEY` is set and valid
- **Old timestamps:** Check Inngest jobs are running (sync service, classify-message)

## Log Format

All pipeline events log as single-line JSON:
- `open_ingested` - Email open detected
- `reply_ingested` - Reply received and matched
- `rag_computed` - Risk level computed (LLM or deterministic)

Each log includes:
- `event`: Event type
- `requestId`: Task ID
- `recipientHash`: SHA256 hash of email (first 16 chars, no PII)
- `timestampMs`: Unix timestamp in milliseconds
- `result`: `{riskLevel, readStatus}`
- `method`: (optional) "llm" or "deterministic_fallback"


