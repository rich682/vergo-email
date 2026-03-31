import { Resend } from "resend"

let resendClient: Resend | null = null

function getResend(): Resend | null {
  if (resendClient) return resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  resendClient = new Resend(apiKey)
  return resendClient
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || "noreply@tryvergo.com"
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_ADMIN_URL) return process.env.NEXT_PUBLIC_ADMIN_URL.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3001"
}

interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<EmailResult> {
  const resend = getResend()
  const from = getFromEmail()

  console.log(`[AdminEmail] Sending email to ${to}, from: ${from}, resend configured: ${!!resend}`)

  if (!resend) {
    console.log("[AdminEmail] No RESEND_API_KEY — logging email:")
    console.log(`  To: ${to}, Subject: ${subject}`)
    const urlMatch = html.match(/href="([^"]+\?token=[^"]+)"/)
    if (urlMatch) console.log(`  Action URL: ${urlMatch[1]}`)
    return { success: true, messageId: "dev-mode" }
  }

  try {
    const result = await resend.emails.send({ from, to, subject, html, text })
    if (result.error) {
      console.error("[AdminEmail] Resend error:", result.error)
      return { success: false, error: result.error.message }
    }
    return { success: true, messageId: result.data?.id }
  } catch (err: any) {
    console.error("[AdminEmail] Send failed:", err)
    return { success: false, error: err.message }
  }
}

function emailTemplate(title: string, subtitle: string, body: string, buttonText: string, buttonUrl: string, footer: string): string {
  const baseUrl = getBaseUrl()
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;background:#f9fafb;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;">
<tr><td style="padding:40px 20px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
<tr><td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #f3f4f6;">
<span style="font-size:20px;font-weight:700;color:#111827;">Vergo Admin</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#111827;text-align:center;">${title}</h1>
<p style="margin:0 0 32px;color:#6b7280;text-align:center;">${subtitle}</p>
${body}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
<tr><td style="text-align:center;">
<a href="${buttonUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;border-radius:8px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);">${buttonText}</a>
</td></tr></table>
<p style="margin:32px 0 0;color:#9ca3af;font-size:14px;text-align:center;">${footer}</p>
</td></tr>
<tr><td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;">
<p style="margin:0 0 8px;color:#9ca3af;font-size:12px;text-align:center;">If the button doesn't work, copy and paste this link:</p>
<p style="margin:0;word-break:break-all;text-align:center;"><a href="${buttonUrl}" style="color:#f97316;font-size:12px;">${buttonUrl}</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`
}

export async function sendPasswordResetEmail(email: string, token: string, name?: string): Promise<EmailResult> {
  const baseUrl = getBaseUrl()
  const resetUrl = `${baseUrl}/reset-password?token=${token}`

  const html = emailTemplate(
    "Reset Your Password",
    "Choose a new password for your admin account",
    `<p style="margin:0 0 32px;color:#374151;">Hi${name ? ` ${name}` : ""},<br/>We received a request to reset your admin dashboard password. Click the button below to choose a new one.</p>`,
    "Reset Password",
    resetUrl,
    "This link will expire in 1 hour."
  )

  const text = `Reset your Vergo Admin password:\n\n${resetUrl}\n\nThis link expires in 1 hour.`
  return sendEmail(email, "Reset your password - Vergo Admin", html, text)
}

export async function sendAdminInviteEmail(email: string, token: string, inviterName?: string): Promise<EmailResult> {
  const baseUrl = getBaseUrl()
  const inviteUrl = `${baseUrl}/accept-invite?token=${token}`
  const who = inviterName ? `${inviterName} has` : "You've been"

  const html = emailTemplate(
    "You're Invited!",
    "Join the Vergo Admin Dashboard",
    `<p style="margin:0 0 32px;color:#374151;">${who} invited you to join the Vergo Admin Dashboard. Click below to set your password and get started.</p>`,
    "Accept Invitation",
    inviteUrl,
    "This invitation will expire in 7 days."
  )

  const text = `You've been invited to the Vergo Admin Dashboard:\n\n${inviteUrl}\n\nThis link expires in 7 days.`
  return sendEmail(email, "You've been invited to Vergo Admin", html, text)
}

export function generateToken(): string {
  const crypto = require("crypto")
  return crypto.randomBytes(32).toString("base64url")
}

export function tokenExpiry(type: "reset" | "invite"): Date {
  const now = Date.now()
  return new Date(now + (type === "reset" ? 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000))
}
