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
  return process.env.NEXTAUTH_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : "http://localhost:3000"
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
    
    const subject = "Verify your email address"
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to Vergo</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="margin-top: 0;">Hi${userName ? ` ${userName}` : ""},</p>
            <p>Thanks for signing up! Please verify your email address to get started.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="background: #4f46e5; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This link will expire in 24 hours.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${verifyUrl}" style="color: #4f46e5; word-break: break-all;">${verifyUrl}</a>
            </p>
          </div>
        </body>
      </html>
    `

    return this.sendEmail(email, subject, html)
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
    
    const subject = "Reset your password"
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="margin-top: 0;">Hi${userName ? ` ${userName}` : ""},</p>
            <p>We received a request to reset your password. Click the button below to choose a new password.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #4f46e5; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetUrl}" style="color: #4f46e5; word-break: break-all;">${resetUrl}</a>
            </p>
          </div>
        </body>
      </html>
    `

    return this.sendEmail(email, subject, html)
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
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="margin-top: 0;">Hi there,</p>
            <p>${inviterText} invited you to join <strong>${orgName}</strong> on Vergo${roleText}.</p>
            <p>Vergo helps accounting teams automate document collection and follow-ups.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="background: #4f46e5; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This invitation will expire in 7 days.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${inviteUrl}" style="color: #4f46e5; word-break: break-all;">${inviteUrl}</a>
            </p>
          </div>
        </body>
      </html>
    `

    return this.sendEmail(email, subject, html)
  }

  /**
   * Core email sending method
   */
  private static async sendEmail(
    to: string,
    subject: string,
    html: string
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
      const result = await resend.emails.send({
        from,
        to,
        subject,
        html,
      })

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
   */
  static generateToken(): string {
    const crypto = require("crypto")
    return crypto.randomBytes(32).toString("hex")
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
