/**
 * Resend Email Provider
 * 
 * Used as a fallback delivery channel when Gmail/Microsoft/SMTP sends fail.
 * Resend has dedicated infrastructure with high deliverability, proper SPF/DKIM/DMARC,
 * and established relationships with inbox providers — making it ideal for reaching
 * recipients with strict email policies.
 * 
 * Key design decisions:
 * - Reply-To is set to the user's connected email so replies go to their inbox
 * - From is set as "User Name via Vergo <notifications@domain>" for transparency
 * - List-Unsubscribe header is included for deliverability
 * - Gracefully returns null if RESEND_API_KEY is not configured
 */

import { Resend } from "resend"

// Lazy-initialized Resend client
let resendClient: Resend | null = null

function getResendClient(): Resend | null {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  resendClient = new Resend(apiKey)
  return resendClient
}

function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || "notifications@tryvergo.com"
}

export interface ResendSendParams {
  to: string
  subject: string
  body: string           // Plain text
  htmlBody?: string
  replyTo: string        // User's real email so replies go back to them
  senderName?: string    // User's display name for the From field
  attachments?: Array<{
    filename: string
    content: Buffer | string  // Buffer or base64 string
    contentType: string
  }>
}

export interface ResendSendResult {
  messageId: string
  providerData: {
    provider: "resend"
    resendId: string
  }
}

export class ResendProvider {
  /**
   * Check if Resend is available (API key configured)
   */
  static isAvailable(): boolean {
    return !!process.env.RESEND_API_KEY
  }

  /**
   * Send an email via Resend as a fallback.
   * Returns null if Resend is not configured.
   * Throws if Resend is configured but the send fails.
   */
  static async sendEmail(params: ResendSendParams): Promise<ResendSendResult | null> {
    const resend = getResendClient()
    if (!resend) {
      return null // Resend not configured — skip silently
    }

    const fromEmail = getResendFromEmail()
    // Show who sent it: "Richard Kane via Vergo <notifications@tryvergo.com>"
    const fromDisplay = params.senderName
      ? `${params.senderName} via Vergo <${fromEmail}>`
      : `Vergo <${fromEmail}>`

    // Build attachment payload for Resend
    const resendAttachments = params.attachments?.map(a => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content, "base64"),
    }))

    const emailPayload: any = {
      from: fromDisplay,
      to: [params.to],
      subject: params.subject,
      html: params.htmlBody || params.body.replace(/\n/g, "<br>"),
      text: params.body,
      reply_to: params.replyTo,
      headers: {
        // Unique ID prevents Gmail from collapsing multiple emails into one thread
        "X-Entity-Ref-ID": `vergo-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        // List-Unsubscribe for deliverability (mailto fallback)
        "List-Unsubscribe": `<mailto:${params.replyTo}?subject=Unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }

    if (resendAttachments && resendAttachments.length > 0) {
      emailPayload.attachments = resendAttachments
    }

    console.log(`[ResendProvider] Sending fallback email to ${params.to} via Resend`)

    const result = await resend.emails.send(emailPayload)

    if (result.error) {
      console.error(`[ResendProvider] Resend API error:`, result.error)
      throw new Error(`Resend delivery failed: ${result.error.message}`)
    }

    console.log(`[ResendProvider] Email sent successfully via Resend, id: ${result.data?.id}`)

    return {
      messageId: result.data?.id || "",
      providerData: {
        provider: "resend" as const,
        resendId: result.data?.id || "",
      },
    }
  }
}
