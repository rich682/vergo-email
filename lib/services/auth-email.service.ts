/**
 * Auth Email Service
 * Handles transactional emails for authentication flows:
 * - Email verification
 * - Password reset
 * - Team invitations
 * 
 * Uses Resend for reliable email delivery
 */

import { Resend } from "resend"

// Initialize Resend client
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("[AuthEmailService] RESEND_API_KEY not configured - emails will be logged only")
    return null
  }
  return new Resend(apiKey)
}

const getFromEmail = () => {
  return process.env.RESEND_FROM_EMAIL || "noreply@example.com"
}

const getBaseUrl = () => {
  // Priority: NEXTAUTH_URL > VERCEL_URL > localhost
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "") // Remove trailing slash
  }
  if (process.env.VERCEL_URL) {
    // VERCEL_URL doesn't include protocol
    return `https://${process.env.VERCEL_URL}`
  }
  return "http://localhost:3000"
}

interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export class AuthEmailService {
  /**
   * Send email verification link to new users
   */
  static async sendVerificationEmail(
    email: string,
    token: string,
    userName?: string
  ): Promise<EmailResult> {
    const baseUrl = getBaseUrl()
    const verifyUrl = `${baseUrl}/auth/verify-email?token=${token}`
    
    console.log(`[AuthEmailService] Sending verification email:`)
    console.log(`  To: ${email}`)
    console.log(`  Base URL: ${baseUrl}`)
    console.log(`  Verify URL: ${verifyUrl}`)
    
    const subject = "Verify your email address - Vergo"
    
    // Plain text version for email clients that don't support HTML
    const text = `
Welcome to Vergo!

Hi${userName ? ` ${userName}` : ""},

Thanks for signing up! Please verify your email address by clicking the link below:

${verifyUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

- The Vergo Team
    `.trim()
    
    // HTML version - using table-based layout for better email client compatibility
    const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #1f2937; background-color: #f9fafb;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Logo Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #f3f4f6;">
              <img src="${baseUrl}/logo.svg" alt="Vergo" width="100" height="32" style="display: block; margin: 0 auto;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #111827; text-align: center;">Welcome to Vergo</h1>
              <p style="margin: 0 0 32px 0; color: #6b7280; text-align: center;">Verify your email to get started</p>
              
              <p style="margin: 0 0 24px 0; color: #374151;">Hi${userName ? ` ${userName}` : ""},</p>
              <p style="margin: 0 0 32px 0; color: #374151;">Thanks for signing up! Click the button below to verify your email address and start using Vergo.</p>
              
              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="${verifyUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 32px 0 0 0; color: #9ca3af; font-size: 14px; text-align: center;">This link will expire in 24 hours.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #f3f4f6;">
              <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 12px; text-align: center;">
                If the button doesn't work, copy and paste this link:
              </p>
              <p style="margin: 0; word-break: break-all; text-align: center;">
                <a href="${verifyUrl}" style="color: #f97316; font-size: 12px;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
        </table>
        <!-- Bottom text -->
        <p style="margin: 24px 0 0 0; color: #9ca3af; font-size: 12px; text-align: center;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()

    return this.sendEmail(email, subject, html, text)
  }

  /**
   * Send password reset link
   */
  static async sendPasswordResetEmail(
    email: string,
    token: string,
    userName?: string
  ): Promise<EmailResult> {
    const baseUrl = getBaseUrl()
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`
    
    const subject = "Reset your password - Vergo"
    
    const text = `
Password Reset Request

Hi${userName ? ` ${userName}` : ""},

We received a request to reset your password. Click the link below to choose a new password:

${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

- The Vergo Team
    `.trim()
    
    const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #1f2937; background-color: #f9fafb;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Logo Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #f3f4f6;">
              <img src="${baseUrl}/logo.svg" alt="Vergo" width="100" height="32" style="display: block; margin: 0 auto;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #111827; text-align: center;">Reset Your Password</h1>
              <p style="margin: 0 0 32px 0; color: #6b7280; text-align: center;">Choose a new password for your account</p>
              
              <p style="margin: 0 0 24px 0; color: #374151;">Hi${userName ? ` ${userName}` : ""},</p>
              <p style="margin: 0 0 32px 0; color: #374151;">We received a request to reset your password. Click the button below to choose a new password.</p>
              
              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 32px 0 0 0; color: #9ca3af; font-size: 14px; text-align: center;">This link will expire in 1 hour.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #f3f4f6;">
              <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 12px; text-align: center;">
                If the button doesn't work, copy and paste this link:
              </p>
              <p style="margin: 0; word-break: break-all; text-align: center;">
                <a href="${resetUrl}" style="color: #f97316; font-size: 12px;">${resetUrl}</a>
              </p>
            </td>
          </tr>
        </table>
        <!-- Bottom text -->
        <p style="margin: 24px 0 0 0; color: #9ca3af; font-size: 12px; text-align: center;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()

    return this.sendEmail(email, subject, html, text)
  }

  /**
   * Send team invitation email
   */
  static async sendTeamInviteEmail(
    email: string,
    token: string,
    orgName: string,
    inviterName?: string,
    role?: string
  ): Promise<EmailResult> {
    const baseUrl = getBaseUrl()
    const inviteUrl = `${baseUrl}/auth/accept-invite?token=${token}`
    
    const inviterText = inviterName ? `${inviterName} has` : "You've been"
    const roleText = role ? ` as a ${role.toLowerCase()}` : ""
    
    const subject = `You've been invited to join ${orgName} on Vergo`
    
    const text = `
You're Invited to Vergo!

Hi there,

${inviterText} invited you to join ${orgName} on Vergo${roleText}.

Vergo helps teams send requests, track responses, and close tasks faster.

Accept your invitation by clicking the link below:

${inviteUrl}

This invitation will expire in 7 days.

- The Vergo Team
    `.trim()
    
    const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're Invited</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #1f2937; background-color: #f9fafb;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Logo Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #f3f4f6;">
              <img src="${baseUrl}/logo.svg" alt="Vergo" width="100" height="32" style="display: block; margin: 0 auto;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #111827; text-align: center;">You're Invited!</h1>
              <p style="margin: 0 0 32px 0; color: #6b7280; text-align: center;">Join your team on Vergo</p>
              
              <p style="margin: 0 0 24px 0; color: #374151;">Hi there,</p>
              <p style="margin: 0 0 16px 0; color: #374151;">${inviterText} invited you to join <strong style="color: #111827;">${orgName}</strong> on Vergo${roleText}.</p>
              <p style="margin: 0 0 32px 0; color: #6b7280;">Vergo helps teams send requests, track responses, and close tasks faster with AI-powered follow-ups.</p>
              
              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 32px 0 0 0; color: #9ca3af; font-size: 14px; text-align: center;">This invitation will expire in 7 days.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #f3f4f6;">
              <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 12px; text-align: center;">
                If the button doesn't work, copy and paste this link:
              </p>
              <p style="margin: 0; word-break: break-all; text-align: center;">
                <a href="${inviteUrl}" style="color: #f97316; font-size: 12px;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()

    return this.sendEmail(email, subject, html, text)
  }

  /**
   * Core email sending method
   */
  private static async sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string
  ): Promise<EmailResult> {
    const resend = getResendClient()
    const from = getFromEmail()

    // If Resend is not configured, log the email for development
    if (!resend) {
      console.log("[AuthEmailService] Email would be sent:")
      console.log(`  To: ${to}`)
      console.log(`  Subject: ${subject}`)
      console.log(`  From: ${from}`)
      // Extract URL from HTML for easy testing
      const urlMatch = html.match(/href="([^"]+\?token=[^"]+)"/)
      if (urlMatch) {
        console.log(`  Action URL: ${urlMatch[1]}`)
      }
      return { success: true, messageId: "dev-mode-no-send" }
    }

    try {
      const emailPayload: any = {
        from,
        to,
        subject,
        html,
      }
      
      // Add plain text version if provided
      if (text) {
        emailPayload.text = text
      }
      
      const result = await resend.emails.send(emailPayload)

      if (result.error) {
        console.error("[AuthEmailService] Resend error:", result.error)
        return { success: false, error: result.error.message }
      }

      console.log(`[AuthEmailService] Email sent successfully to ${to}, messageId: ${result.data?.id}`)
      return { success: true, messageId: result.data?.id }
    } catch (error: any) {
      console.error("[AuthEmailService] Failed to send email:", error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Generate a secure random token for verification/reset links
   * Uses URL-safe base64 encoding for shorter tokens that work better in emails
   */
  static generateToken(): string {
    const crypto = require("crypto")
    // Use base64url encoding for shorter, URL-safe tokens (43 chars vs 64 hex chars)
    return crypto.randomBytes(32).toString("base64url")
  }

  /**
   * Get token expiry time
   */
  static getTokenExpiry(type: "verification" | "reset" | "invite"): Date {
    const now = new Date()
    switch (type) {
      case "verification":
        return new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours
      case "reset":
        return new Date(now.getTime() + 60 * 60 * 1000) // 1 hour
      case "invite":
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000)
    }
  }
}
