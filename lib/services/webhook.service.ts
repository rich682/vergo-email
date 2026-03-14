/**
 * Webhook Service
 * Fire-and-forget webhook dispatcher for external integrations (e.g. n8n → HubSpot).
 * Never blocks the caller — failures are logged but silently swallowed.
 */

export type WebhookEvent =
  | "user.signup"        // Self-service org + admin creation
  | "user.invite_accepted" // Team member accepted invite

interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  data: Record<string, unknown>
}

/**
 * Fire a webhook to the configured N8N_WEBHOOK_URL.
 * Returns immediately — the fetch runs in the background.
 */
export function fireWebhook(event: WebhookEvent, data: Record<string, unknown>): void {
  const url = process.env.N8N_WEBHOOK_URL
  if (!url) return // not configured — skip silently

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  }

  const secret = process.env.N8N_WEBHOOK_SECRET || ""

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000), // 10s timeout
  })
    .then((res) => {
      if (!res.ok) {
        console.error(`[Webhook] ${event} failed: ${res.status} ${res.statusText}`)
      } else {
        console.log(`[Webhook] ${event} sent successfully`)
      }
    })
    .catch((err) => {
      console.error(`[Webhook] ${event} error:`, err.message)
    })
}
