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
import { RequestCreationService } from "@/lib/services/request-creation.service"

/**
 * Get the base URL for form links
 * Priority: NEXTAUTH_URL > VERCEL_URL > NEXT_PUBLIC_APP_URL > localhost
 */
const getBaseUrl = (): string => {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "")
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  }
  return "http://localhost:3000"
}

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
  accessToken?: string | null // For external stakeholder access
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
      accessToken,
    } = data

    // Include access token in URL for external stakeholder access
    const formUrl = accessToken 
      ? `${getBaseUrl()}/forms/${formRequestId}?token=${accessToken}`
      : `${getBaseUrl()}/forms/${formRequestId}`
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
      console.log(`[FormNotification] Sending form request email to ${recipientEmail}`)
      console.log(`[FormNotification] Subject: ${subject}`)
      
      // Send email via system email (noreply@tryvergo.com) so it doesn't come from user's personal inbox
      await EmailSendingService.sendEmail({
        organizationId,
        to: recipientEmail,
        toName: recipientName || undefined,
        subject,
        body,
        htmlBody,
        campaignName: formName,
        campaignType: "form_request",
        requestType: "form",  // Mark as form request
        deadlineDate: deadlineDate || undefined,
        useSystemEmail: true,
        senderName: senderName || undefined,
        replyTo: senderEmail || undefined,
      })

      return true
    } catch (error: any) {
      console.error(`[FormNotification] Failed to send form request email:`, error)
      
      // Create a failed Request record so it shows up in the UI with SEND_FAILED status
      try {
        const failedRequest = await RequestCreationService.createRequestFromEmail({
          organizationId,
          entityEmail: recipientEmail,
          entityName: recipientName || undefined,
          campaignName: formName,
          campaignType: "form_request",
          requestType: "form",
          threadId: `failed-form-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          replyToEmail: "failed@send",
          subject,
          deadlineDate,
        })
        await prisma.request.update({
          where: { id: failedRequest.id },
          data: {
            status: "SEND_FAILED",
            aiReasoning: { error: error?.message || "Unknown error", failedAt: new Date().toISOString(), type: "form_request" }
          }
        })
        console.log(`[FormNotification] Created SEND_FAILED request record for ${recipientEmail}`)
      } catch (createErr: any) {
        console.error(`[FormNotification] Failed to create failed request record:`, createErr)
      }
      
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
      accessToken,
    } = data

    // Include access token in URL for external stakeholder access
    const formUrl = accessToken 
      ? `${getBaseUrl()}/forms/${formRequestId}?token=${accessToken}`
      : `${getBaseUrl()}/forms/${formRequestId}`
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
      
      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>${greeting}</p>
  
  <p>This is a friendly reminder to complete your form:</p>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>📝 ${formName}</strong></p>
    <p style="margin: 0 0 8px 0; color: #666;">📋 ${taskName}</p>
    ${deadlineText ? `<p style="margin: 0; color: #666;">📅 ${deadlineText}</p>` : ""}
  </div>
  
  <p style="color: ${isLastReminder ? '#dc2626' : '#666'}; font-weight: ${isLastReminder ? 'bold' : 'normal'};">
    ${urgencyText}
  </p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${formUrl}" style="display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
      Complete Form →
    </a>
  </div>
  
  <p>
    Best regards,<br>
    ${senderName || "The Team"}
  </p>
</body>
</html>`

      await EmailSendingService.sendEmail({
        organizationId,
        to: recipientEmail,
        toName: recipientName || undefined,
        subject,
        body,
        htmlBody,
        campaignName: formName,
        campaignType: "form_reminder",
        requestType: "form",  // Mark as form request
        skipRateLimit: true, // Reminders bypass rate limit
        useSystemEmail: true,
        senderName: senderName || undefined,
        replyTo: data.senderEmail || undefined,
      })
      
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
      
      // Note: Confirmation emails are optional and lower priority
      // We don't have organizationId here, so we skip actual sending for now
      // TODO: Add organizationId to this method signature if confirmations are needed
      
      return true
    } catch (error) {
      console.error(`[FormNotification] Failed to send confirmation email:`, error)
      return false
    }
  }

  /**
   * Send email notification to form creator/owner when a form is submitted
   */
  static async sendOwnerSubmissionNotification(data: {
    formRequestId: string
    formName: string
    taskName: string
    submitterName: string
    submitterEmail: string | null
    organizationId: string
    ownerEmail: string
    ownerName: string | null
    taskInstanceId: string
  }): Promise<boolean> {
    const {
      formName,
      taskName,
      submitterName,
      submitterEmail,
      organizationId,
      ownerEmail,
      ownerName,
      taskInstanceId,
    } = data

    const greeting = ownerName ? `Hi ${ownerName.split(" ")[0]},` : "Hello,"
    const taskUrl = `${getBaseUrl()}/dashboard/jobs/${taskInstanceId}`

    const subject = `Form Submitted: ${formName}`

    const body = `${greeting}

${submitterName}${submitterEmail ? ` (${submitterEmail})` : ""} has submitted a response to your form:

📝 ${formName}
📋 ${taskName}

View the response here:
${taskUrl}

Best regards,
Vergo`

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>${greeting}</p>

  <p><strong>${submitterName}</strong>${submitterEmail ? ` (${submitterEmail})` : ""} has submitted a response to your form:</p>

  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>📝 ${formName}</strong></p>
    <p style="margin: 0; color: #666;">📋 ${taskName}</p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${taskUrl}" style="display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
      View Response →
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    Best regards,<br>
    Vergo
  </p>
</body>
</html>`

    try {
      console.log(`[FormNotification] Sending owner submission notification to ${ownerEmail}`)

      await EmailSendingService.sendEmail({
        organizationId,
        to: ownerEmail,
        toName: ownerName || undefined,
        subject,
        body,
        htmlBody,
        campaignName: formName,
        campaignType: "form_submission_notification",
        useSystemEmail: true,
      })

      return true
    } catch (error) {
      console.error(`[FormNotification] Failed to send owner submission notification:`, error)
      return false
    }
  }

  /**
   * Send form request emails to all recipients in a batch (internal users)
   */
  static async sendBulkFormRequestEmails(
    formRequests: Array<{
      id: string
      accessToken?: string | null
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
        accessToken: request.accessToken,
      })

      if (success) {
        sent++
      } else {
        failed++
      }
    }

    return { sent, failed }
  }

  /**
   * Send form request emails to entity recipients (external stakeholders)
   */
  static async sendBulkFormRequestEmailsForEntities(
    formRequests: Array<{
      id: string
      accessToken?: string | null
      recipientEntity: { 
        email: string | null
        firstName: string
        lastName: string | null
      } | null
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
      // Skip if no entity or no email
      if (!request.recipientEntity?.email) {
        failed++
        continue
      }

      const recipientName = request.recipientEntity.firstName + 
        (request.recipientEntity.lastName ? ` ${request.recipientEntity.lastName}` : "")

      const success = await this.sendFormRequestEmail({
        formRequestId: request.id,
        recipientEmail: request.recipientEntity.email,
        recipientName,
        formName,
        taskName,
        senderName,
        senderEmail,
        deadlineDate,
        boardPeriod,
        organizationId,
        accessToken: request.accessToken,
      })

      if (success) {
        sent++
      } else {
        failed++
      }
    }

    return { sent, failed }
  }

  /**
   * Send email notification when a form request's custom status changes
   */
  static async sendStatusChangeEmail(data: {
    formName: string
    taskName: string
    oldStatus: string
    newStatus: string
    recipientEmail: string
    recipientName: string | null
    organizationId: string
    accessToken?: string | null
    changerName: string | null
  }): Promise<boolean> {
    const {
      formName,
      taskName,
      oldStatus,
      newStatus,
      recipientEmail,
      recipientName,
      organizationId,
      accessToken,
      changerName,
    } = data

    const greeting = recipientName ? `Hi ${recipientName.split(" ")[0]},` : "Hello,"
    const changerText = changerName || "Your team"
    const baseUrl = getBaseUrl()
    const viewUrl = accessToken
      ? `${baseUrl}/forms/token/${accessToken}`
      : `${baseUrl}/dashboard`

    const subject = `Status Update: "${formName}"`

    const body = `${greeting}

${changerText} has updated the status of your form submission:

📝 ${formName}
📋 ${taskName}

Status changed: ${oldStatus} → ${newStatus}

${accessToken ? `View your submission here:\n${viewUrl}` : `Log in to view your submission:\n${viewUrl}`}

Best regards,
Vergo`

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>${greeting}</p>

  <p><strong>${changerText}</strong> has updated the status of your form submission:</p>

  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>📝 ${formName}</strong></p>
    <p style="margin: 0 0 8px 0; color: #666;">📋 ${taskName}</p>
    <p style="margin: 0;">Status: <span style="text-decoration: line-through; color: #999;">${oldStatus}</span> → <strong style="color: #16a34a;">${newStatus}</strong></p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${viewUrl}" style="display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
      View Submission →
    </a>
  </div>

  <p style="color: #666; font-size: 14px;">
    Best regards,<br>
    Vergo
  </p>
</body>
</html>`

    try {
      console.log(`[FormNotification] Sending status change email to ${recipientEmail}: ${oldStatus} → ${newStatus}`)

      await EmailSendingService.sendEmail({
        organizationId,
        to: recipientEmail,
        toName: recipientName || undefined,
        subject,
        body,
        htmlBody,
        campaignName: formName,
        campaignType: "form_status_change",
        useSystemEmail: true,
        senderName: changerName || undefined,
      })

      return true
    } catch (error) {
      console.error(`[FormNotification] Failed to send status change email:`, error)
      return false
    }
  }
}
