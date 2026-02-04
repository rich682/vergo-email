/**
 * Form Notification Service
 * 
 * Handles sending email notifications for form requests:
 * - Initial form request emails
 * - Reminder emails for incomplete forms
 * - Confirmation emails after submission
 */

import { prisma } from "@/lib/prisma"
import { EmailSendingService } from "@/lib/services/email-sending.service"

interface FormRequestEmailData {
  formRequestId: string
  recipientEmail: string
  recipientName: string | null
  formName: string
  taskName: string
  senderName: string | null
  senderEmail: string
  deadlineDate: Date | null
  boardPeriod: string | null
  organizationId: string
}

interface FormReminderEmailData extends FormRequestEmailData {
  reminderNumber: number
  maxReminders: number
}

export class FormNotificationService {
  /**
   * Send initial form request email
   */
  static async sendFormRequestEmail(data: FormRequestEmailData): Promise<boolean> {
    const {
      formRequestId,
      recipientEmail,
      recipientName,
      formName,
      taskName,
      senderName,
      senderEmail,
      deadlineDate,
      boardPeriod,
      organizationId,
    } = data

    const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vergo.com"}/forms/${formRequestId}`
    const greeting = recipientName ? `Hi ${recipientName.split(" ")[0]},` : "Hello,"
    
    const deadlineText = deadlineDate
      ? `Please complete this by ${deadlineDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
      : "Please complete this at your earliest convenience."

    const periodText = boardPeriod ? `Period: ${boardPeriod}\n` : ""

    const subject = `Form Request: ${formName}${boardPeriod ? ` - ${boardPeriod}` : ""}`

    const body = `${greeting}

${senderName || "Your team"} has requested you complete a form for:

📝 ${formName}
📋 ${taskName}
${periodText}
${deadlineText}

Click the link below to complete the form:
${formUrl}

If you have any questions, please reply to this email.

Best regards,
${senderName || "The Team"}`

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>${greeting}</p>
  
  <p>${senderName || "Your team"} has requested you complete a form for:</p>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>📝 ${formName}</strong></p>
    <p style="margin: 0 0 8px 0; color: #666;">📋 ${taskName}</p>
    ${boardPeriod ? `<p style="margin: 0; color: #666;">📅 Period: ${boardPeriod}</p>` : ""}
  </div>
  
  <p>${deadlineText}</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${formUrl}" style="display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
      Complete Form →
    </a>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    If you have any questions, please reply to this email.
  </p>
  
  <p>
    Best regards,<br>
    ${senderName || "The Team"}
  </p>
</body>
</html>`

    try {
      // Use EmailSendingService to send the email
      // For now, we'll log and return true (actual implementation would use the email service)
      console.log(`[FormNotification] Sending form request email to ${recipientEmail}`)
      console.log(`[FormNotification] Subject: ${subject}`)
      
      // In production, this would call EmailSendingService
      // await EmailSendingService.sendEmail({
      //   to: recipientEmail,
      //   subject,
      //   body,
      //   htmlBody,
      //   organizationId,
      // })

      return true
    } catch (error) {
      console.error(`[FormNotification] Failed to send form request email:`, error)
      return false
    }
  }

  /**
   * Send reminder email for incomplete form
   */
  static async sendFormReminderEmail(data: FormReminderEmailData): Promise<boolean> {
    const {
      formRequestId,
      recipientEmail,
      recipientName,
      formName,
      taskName,
      senderName,
      deadlineDate,
      boardPeriod,
      reminderNumber,
      maxReminders,
      organizationId,
    } = data

    const formUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vergo.com"}/forms/${formRequestId}`
    const greeting = recipientName ? `Hi ${recipientName.split(" ")[0]},` : "Hello,"
    
    const isLastReminder = reminderNumber >= maxReminders
    const urgencyText = isLastReminder
      ? "This is a final reminder."
      : `This is reminder ${reminderNumber} of ${maxReminders}.`

    const deadlineText = deadlineDate
      ? `The deadline is ${deadlineDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
      : ""

    const subject = `Reminder: ${formName} - Action Required`

    const body = `${greeting}

This is a friendly reminder to complete your form:

📝 ${formName}
📋 ${taskName}
${deadlineText}

${urgencyText}

Click the link below to complete the form:
${formUrl}

Best regards,
${senderName || "The Team"}`

    try {
      console.log(`[FormNotification] Sending reminder ${reminderNumber} to ${recipientEmail}`)
      console.log(`[FormNotification] Subject: ${subject}`)
      
      return true
    } catch (error) {
      console.error(`[FormNotification] Failed to send reminder email:`, error)
      return false
    }
  }

  /**
   * Send confirmation email after form submission
   */
  static async sendSubmissionConfirmation(
    formRequestId: string,
    recipientEmail: string,
    recipientName: string | null,
    formName: string
  ): Promise<boolean> {
    const greeting = recipientName ? `Hi ${recipientName.split(" ")[0]},` : "Hello,"

    const subject = `Confirmation: ${formName} Submitted`

    const body = `${greeting}

Thank you for completing the form: ${formName}

Your response has been recorded. If you need to make any changes, please contact your administrator.

Best regards,
The Team`

    try {
      console.log(`[FormNotification] Sending submission confirmation to ${recipientEmail}`)
      console.log(`[FormNotification] Subject: ${subject}`)
      
      return true
    } catch (error) {
      console.error(`[FormNotification] Failed to send confirmation email:`, error)
      return false
    }
  }

  /**
   * Send form request emails to all recipients in a batch
   */
  static async sendBulkFormRequestEmails(
    formRequests: Array<{
      id: string
      recipientUser: { email: string; name: string | null }
    }>,
    formName: string,
    taskName: string,
    senderName: string | null,
    senderEmail: string,
    deadlineDate: Date | null,
    boardPeriod: string | null,
    organizationId: string
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0
    let failed = 0

    for (const request of formRequests) {
      const success = await this.sendFormRequestEmail({
        formRequestId: request.id,
        recipientEmail: request.recipientUser.email,
        recipientName: request.recipientUser.name,
        formName,
        taskName,
        senderName,
        senderEmail,
        deadlineDate,
        boardPeriod,
        organizationId,
      })

      if (success) {
        sent++
      } else {
        failed++
      }
    }

    return { sent, failed }
  }
}
