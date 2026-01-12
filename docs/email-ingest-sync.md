# Email Ingestion Sync (Gmail MVP, Outlook-ready)

## Gmail verification steps
- Send an outbound request email from the app to a Gmail inbox.
- Reply from the Gmail inbox.
- Within 1–2 cron ticks (Inngest `sync-gmail-accounts` runs every minute), confirm the reply is ingested: task status moves to replied/has attachments as applicable and a new inbound message is created.
- Temporarily disable or ignore the Gmail webhook (e.g., stop Pub/Sub delivery) and send another reply; confirm the cron cursor sync alone ingests the message within 1–2 ticks.
- Verify no duplicate inbound messages exist for the same Gmail message ID (providerId).
- Inspect logs for the run: provider, accountHash, cursor before/after, history pages, messageIds, processed/skipped counts, errors.

## Outlook readiness (delta queries)
- Implement `MicrosoftIngestProvider.fetchInboundSinceCursor` using Microsoft Graph delta queries for the `/messages/delta` endpoint scoped to the mailbox inbox.
- Cursor shape: store Graph `@odata.deltaLink` in `syncCursor.microsoft.deltaLink`.
- Normalize inbound messages with `internetMessageId`, `inReplyTo`, `references`, `threadId` (if available), subject/body/html, attachments, providerId = Graph message `id`.
- Reuse `EmailReceptionService.processInboundEmail` with the same `NormalizedInboundMessage` schema; no correlation changes required.
- Ensure idempotency by de-duping on providerId before processing.
- Update logging parity with Gmail (cursor before/after, page counts, ids found, processed/skipped/errors).
