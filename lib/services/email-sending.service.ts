import { google } from "googleapis"
import nodemailer from "nodemailer"
import { EmailConnectionService } from "./email-connection.service"
import { TokenRefreshService } from "./token-refresh.service"
import { RequestCreationService } from "./request-creation.service"
import { TrackingPixelService } from "./tracking-pixel.service"
import { ConnectedEmailAccount, EmailProvider, EmailSendResult } from "@prisma/client"
import { v4 as uuidv4 } from "uuid"
import { decrypt } from "@/lib/encryption"
import { GmailProvider } from "@/lib/providers/email/gmail-provider"
import { MicrosoftProvider } from "@/lib/providers/email/microsoft-provider"
import { ResendProvider } from "@/lib/providers/email/resend-provider"
import { ReminderStateService } from "./reminder-state.service"
import { EmailQueueService } from "./email-queue.service"
import { validateEmailForSend } from "@/lib/utils/email-validation"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

// Create service-specific logger
const log = logger.child({ service: "EmailSendingService" })

// Rate limiting: max emails per recipient per 24-hour window
// Rate-limited emails are automatically queued for later sending
const RATE_LIMIT_HOURS = 24
const RATE_LIMIT_MAX_EMAILS = 5  // Max emails to same recipient within RATE_LIMIT_HOURS

// Concurrency limit for bulk email sending (max parallel sends)
const BULK_SEND_CONCURRENCY = 5
// Stagger delay between launching each concurrent send (ms)
const BULK_SEND_STAGGER_MS = 400

/**
 * Log an email send to the audit table
 * This is a fire-and-forget operation - failures are logged but don't block the send
 */
async function logEmailSendAudit(data: {
  organizationId: string
  userId?: string | null
  jobId?: string | null
  taskId?: string | null
  emailDraftId?: string | null
  fromEmail: string
  toEmail: string
  subject: string
  recipientCount?: number
  result: EmailSendResult
  errorMessage?: string | null
  errorCode?: string | null
  provider?: EmailProvider | null
  providerId?: string | null
  metadata?: Record<string, any> | null
}): Promise<void> {
  try {
    await prisma.emailSendAudit.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId || null,
        taskInstanceId: data.jobId || null,
        requestId: data.taskId || null,
        emailDraftId: data.emailDraftId || null,
        fromEmail: data.fromEmail,
        toEmail: data.toEmail,
        subject: data.subject.substring(0, 500), // Truncate long subjects
        recipientCount: data.recipientCount || 1,
        result: data.result,
        errorMessage: data.errorMessage || null,
        errorCode: data.errorCode || null,
        provider: data.provider || null,
        providerId: data.providerId || null,
        metadata: data.metadata ?? undefined
      }
    })
  } catch (error) {
    // Log but don't throw - audit failures shouldn't block email sends
    log.error("Failed to log email send audit", error as Error, {
      toEmail: data.toEmail,
      result: data.result
    }, { organizationId: data.organizationId, operation: "logEmailSendAudit" })
  }
}

/**
 * Check if we've already sent too many emails to this recipient within the rate limit window
 * Returns true if rate limited (should NOT send), false if OK to send
 * 
 * NOTE: This is a HARD BLOCK - rate-limited emails are rejected, NOT queued.
 * If you need queuing, implement a separate job queue system.
 */
async function isRecipientRateLimited(
  organizationId: string,
  toEmail: string
): Promise<{ rateLimited: boolean; count: number; lastSentAt?: Date }> {
  try {
    const cutoffTime = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000)
    
    // Count successful sends to this recipient in the rate limit window
    const recentSends = await prisma.emailSendAudit.findMany({
      where: {
        organizationId,
        toEmail: toEmail.toLowerCase(),
        result: "SUCCESS",
        createdAt: { gte: cutoffTime }
      },
      orderBy: { createdAt: "desc" },
      take: RATE_LIMIT_MAX_EMAILS + 1  // Only need to know if we've hit the limit
    })
    
    const count = recentSends.length
    
    if (count >= RATE_LIMIT_MAX_EMAILS) {
      return { 
        rateLimited: true, 
        count,
        lastSentAt: recentSends[0]?.createdAt 
      }
    }
    
    return { rateLimited: false, count }
  } catch (error) {
    // If rate limit check fails, allow the send (fail open)
    log.warn("Rate limit check failed, allowing send", {
      toEmail,
      error: (error as Error).message
    }, { organizationId, operation: "isRecipientRateLimited" })
    return { rateLimited: false, count: 0 }
  }
}

export class EmailSendingService {
  static generateThreadId(): string {
    return uuidv4()
  }

  static generateReplyToAddress(
    threadId: string,
    domain: string
  ): string {
    return `verify+${threadId}@${domain}`
  }

  static extractDomainFromEmail(email: string): string {
    return email.split("@")[1] || email
  }

  static async sendViaGmail(data: {
    account: ConnectedEmailAccount
    to: string
    subject: string
    body: string
    htmlBody?: string
    replyTo: string
  }): Promise<{ messageId: string; providerData: any }> {
    // Ensure token is valid
    const validAccount = await TokenRefreshService.ensureValidToken(data.account)
    
    const oauth2Client = await EmailConnectionService.getGmailClient(validAccount.id)
    if (!oauth2Client) {
      throw new Error("Failed to get Gmail client")
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client })

    // Generate a Message-ID header for tracking (Gmail will use this in In-Reply-To when someone replies)
    const messageIdHeader = `<${Date.now()}-${Math.random().toString(36).substring(2, 15)}@${data.account.email.split('@')[1] || 'gmail.com'}>`

    // Create email message with Message-ID header
    const messageParts = [
      `To: ${data.to}`,
      `From: ${data.account.email}`,
      `Reply-To: ${data.replyTo}`,
      `Message-ID: ${messageIdHeader}`,
      `Subject: ${data.subject}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      data.htmlBody || data.body
    ]

    const message = messageParts.join("\n")
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage
      }
    })

    // After sending, fetch the message to get Gmail's assigned Message-ID (which might differ from what we set)
    let actualMessageId = messageIdHeader
    try {
      const sentMessage = await gmail.users.messages.get({
        userId: "me",
        id: response.data.id || "",
        format: "raw"
      })
      
      if (sentMessage.data.raw) {
        const { simpleParser } = await import("mailparser")
        const parsedSent = await simpleParser(Buffer.from(sentMessage.data.raw, "base64"))
        const actualMessageIdHeader = parsedSent.headers.get("message-id") || parsedSent.headers.get("Message-ID") || messageIdHeader
        actualMessageId = typeof actualMessageIdHeader === 'string' ? actualMessageIdHeader : messageIdHeader
      }
    } catch (e) {
      // If we can't fetch, use the one we generated
      console.warn("Could not fetch sent message to get actual Message-ID, using generated one")
    }

    return {
      messageId: response.data.id || "",
      providerData: {
        ...response.data,
        messageIdHeader: actualMessageId, // Store the Message-ID header for matching replies
        threadId: response.data.threadId
      }
    }
  }

  static async sendViaSMTP(data: {
    account: ConnectedEmailAccount
    to: string
    subject: string
    body: string
    htmlBody?: string
    replyTo: string
  }): Promise<{ messageId: string; providerData: any }> {
    if (!data.account.smtpHost || !data.account.smtpPort || !data.account.smtpUser) {
      throw new Error("SMTP configuration incomplete")
    }

    const credentials = await EmailConnectionService.getDecryptedCredentials(data.account.id)
    if (!credentials?.smtpPassword) {
      throw new Error("SMTP password not available")
    }

    const transporter = nodemailer.createTransport({
      host: data.account.smtpHost,
      port: data.account.smtpPort,
      secure: data.account.smtpSecure,
      auth: {
        user: data.account.smtpUser,
        pass: credentials.smtpPassword
      }
    })

    const mailOptions = {
      from: data.account.email,
      to: data.to,
      subject: data.subject,
      text: data.body,
      html: data.htmlBody,
      replyTo: data.replyTo,
      headers: {
        "List-Unsubscribe": `<mailto:${data.replyTo}?subject=Unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    }

    const info = await transporter.sendMail(mailOptions)

    return {
      messageId: info.messageId || "",
      providerData: info
    }
  }

  static async sendEmail(data: {
    organizationId: string
    userId?: string         // User sending the email (for auto-selecting their account)
    jobId?: string | null   // Parent Job/Item for request-level association
    to: string
    toName?: string
    subject: string
    body: string
    htmlBody?: string
    campaignName?: string
    campaignType?: string
    requestType?: string    // "standard" | "data" | "form"
    accountId?: string      // Explicit account to use (overrides user's account)
    deadlineDate?: Date | null
    skipRateLimit?: boolean  // Allow bypassing rate limit for reminders
    remindersConfig?: {
      enabled: boolean
      startDelayHours: number
      frequencyHours: number
      maxCount: number
      approved: boolean
    }
    attachments?: Array<{ filename: string; content: string; contentType: string }>
  }): Promise<{
    taskId: string
    threadId: string
    messageId: string
  }> {
    // SAFETY CHECK: Per-recipient rate limit (max N emails per 24 hours)
    // Rate-limited emails are automatically queued for later sending
    if (!data.skipRateLimit) {
      const rateCheck = await isRecipientRateLimited(data.organizationId, data.to)
      if (rateCheck.rateLimited) {
        const hoursAgo = rateCheck.lastSentAt 
          ? Math.round((Date.now() - rateCheck.lastSentAt.getTime()) / (1000 * 60 * 60))
          : 0
        
        log.info("Recipient rate limited - queueing email for later", {
          to: data.to,
          count: rateCheck.count,
          maxAllowed: RATE_LIMIT_MAX_EMAILS,
          lastSentAt: rateCheck.lastSentAt,
          hoursAgo
        }, { organizationId: data.organizationId, operation: "sendEmail" })
        
        // Queue the email for later sending
        const queueId = await EmailQueueService.enqueue({
          organizationId: data.organizationId,
          jobId: data.jobId,
          toEmail: data.to,
          subject: data.subject,
          body: data.body,
          htmlBody: data.htmlBody,
          accountId: data.accountId,
          metadata: {
            campaignName: data.campaignName,
            campaignType: data.campaignType,
            deadlineDate: data.deadlineDate,
            remindersConfig: data.remindersConfig,
            rateLimitInfo: { count: rateCheck.count, maxAllowed: RATE_LIMIT_MAX_EMAILS, hoursAgo }
          }
        })
        
        // Audit log the queued send
        await logEmailSendAudit({
          organizationId: data.organizationId,
          jobId: data.jobId,
          fromEmail: "queued",
          toEmail: data.to,
          subject: data.subject,
          result: "QUEUED",
          errorMessage: `Queued for later - already sent ${rateCheck.count} emails in the last ${RATE_LIMIT_HOURS}h (limit: ${RATE_LIMIT_MAX_EMAILS})`,
          metadata: { queueId, count: rateCheck.count, maxAllowed: RATE_LIMIT_MAX_EMAILS, lastSentAt: rateCheck.lastSentAt, hoursAgo, limitHours: RATE_LIMIT_HOURS }
        })
        
        // Return a placeholder response indicating the email was queued
        // The actual taskId will be created when the email is sent from the queue
        return {
          taskId: `queued:${queueId}`,
          threadId: `queued:${queueId}`,
          messageId: `queued:${queueId}`
        }
      }
    }

    // Resolve email account for sending
    // Priority: explicit accountId > user's own account > org primary > any active
    let account: ConnectedEmailAccount | null = null

    if (data.accountId) {
      // Explicit account ID provided - use that
      account = await EmailConnectionService.getById(data.accountId, data.organizationId)
      if (!account) {
        const { prisma } = await import("@/lib/prisma")
        account = await prisma.connectedEmailAccount.findFirst({
          where: {
            id: data.accountId,
            organizationId: data.organizationId,
            isActive: true
          }
        })
      }
    } else if (data.userId) {
      // User ID provided - try to use their connected account
      account = await EmailConnectionService.getAccountForUser(data.userId, data.organizationId)
    } else {
      // Fallback: org's primary or first active account
      account = await EmailConnectionService.getPrimaryAccount(data.organizationId)
      if (!account) {
        account = await EmailConnectionService.getFirstActive(data.organizationId)
      }
    }

    if (!account) {
      log.error("No active email account found", undefined, { organizationId: data.organizationId })
      throw new Error("No active email account found")
    }

    log.info("Sending email", {
      to: data.to,
      subject: data.subject.substring(0, 50),
      provider: "provider" in account ? account.provider : "SMTP",
      jobId: data.jobId
    }, { organizationId: data.organizationId, operation: "sendEmail" })

    // Pre-send email validation: check format and MX records
    try {
      const validation = await validateEmailForSend(data.to)
      if (!validation.valid) {
        throw new Error(validation.reason || `Invalid recipient email: ${data.to}`)
      }
    } catch (validationError: any) {
      // If the error is from our validation (not DNS infrastructure), throw immediately
      if (validationError.message?.includes("does not exist") ||
          validationError.message?.includes("no mail server") ||
          validationError.message?.includes("Invalid email format") ||
          validationError.message?.includes("did you mean")) {
        throw validationError
      }
      // DNS infrastructure errors (timeout, etc.) - allow the send to proceed
      log.warn("Email validation check failed, proceeding with send", {
        to: data.to,
        error: validationError.message
      }, { organizationId: data.organizationId, operation: "sendEmail" })
    }

    // Generate thread ID for internal tracking
    const threadId = this.generateThreadId()
    // Use actual sender email as Reply-To so replies come back to connected inbox
    // We'll match replies using Gmail's In-Reply-To header instead of fake addresses
    const replyTo = account.email

    // Generate tracking token and inject pixel if HTML body exists
    const trackingToken = TrackingPixelService.generateTrackingToken()
    const trackingUrl = TrackingPixelService.generateTrackingUrl(trackingToken)
    let htmlBodyWithTracking = data.htmlBody
    if (data.htmlBody) {
      htmlBodyWithTracking = TrackingPixelService.injectTrackingPixel(data.htmlBody, trackingUrl)
    }

    // Send email based on provider, with Resend as fallback
    let sendResult: { messageId: string; providerData: any }
    let usedFallback = false
    
    // Convert attachments to Buffer format for providers
    const providerAttachments = data.attachments?.map(a => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'base64'),
      contentType: a.contentType
    }))

    try {
      // Primary send: Gmail / Microsoft / SMTP
      if (account.provider === EmailProvider.GMAIL) {
        const provider = new GmailProvider()
        sendResult = await provider.sendEmail({
          account,
          to: data.to,
          subject: data.subject,
          body: data.body,
          htmlBody: htmlBodyWithTracking,
          replyTo,
          attachments: providerAttachments
        })
      } else if (account.provider === EmailProvider.MICROSOFT) {
        const provider = new MicrosoftProvider()
        sendResult = await provider.sendEmail({
          account,
          to: data.to,
          subject: data.subject,
          body: data.body,
          htmlBody: htmlBodyWithTracking,
          replyTo,
          attachments: providerAttachments
        })
      } else {
        // GENERIC_SMTP or fallback
        sendResult = await this.sendViaSMTP({
          account,
          to: data.to,
          subject: data.subject,
          body: data.body,
          htmlBody: htmlBodyWithTracking,
          replyTo,
          attachments: providerAttachments
        } as any)
      }
    } catch (primaryError: any) {
      // Primary send failed — try Resend as fallback
      log.warn("Primary email send failed, attempting Resend fallback", {
        to: data.to,
        primaryError: primaryError.message,
        provider: account.provider
      }, { organizationId: data.organizationId, operation: "sendEmail" })

      if (!ResendProvider.isAvailable()) {
        // No Resend configured — re-throw original error
        throw primaryError
      }

      // Get sender name for the "via Vergo" From header
      let senderName: string | undefined
      try {
        const sender = await prisma.user.findFirst({
          where: { id: data.userId || undefined },
          select: { name: true }
        })
        senderName = sender?.name || undefined
      } catch {
        // Non-critical — proceed without name
      }

      const resendResult = await ResendProvider.sendEmail({
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo,
        senderName,
        attachments: providerAttachments,
      })

      if (!resendResult) {
        // Resend returned null (shouldn't happen since we checked isAvailable)
        throw primaryError
      }

      sendResult = resendResult
      usedFallback = true
      log.info("Email sent successfully via Resend fallback", {
        to: data.to,
        resendId: resendResult.providerData.resendId
      }, { organizationId: data.organizationId, operation: "sendEmail" })
    }

    // Create request + log outbound message atomically
    const task = await prisma.$transaction(async (tx) => {
      const task = await RequestCreationService.createRequestFromEmail({
        organizationId: data.organizationId,
        taskInstanceId: data.jobId || null,
        entityEmail: data.to,
        entityName: data.toName,
        campaignName: data.campaignName,
        campaignType: data.campaignType,
        requestType: data.requestType,
        threadId,
        replyToEmail: replyTo,
        subject: data.subject,
        deadlineDate: data.deadlineDate || null,
        remindersConfig: data.remindersConfig
      }, tx)

      // Log outbound message with tracking token
      await RequestCreationService.logOutboundMessage({
        requestId: task.id,
        entityId: task.entityId!,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        fromAddress: account.email,
        toAddress: data.to,
        providerId: sendResult.messageId,
        providerData: sendResult.providerData,
        trackingToken
      }, tx)

      return task
    })

    log.info("Email sent successfully", {
      taskId: task.id,
      threadId,
      messageId: sendResult.messageId,
      to: data.to
    }, { organizationId: data.organizationId, operation: "sendEmail" })

    // Audit log stays outside transaction (fire-and-forget, non-critical)
    await logEmailSendAudit({
      organizationId: data.organizationId,
      jobId: data.jobId,
      taskId: task.id,
      fromEmail: usedFallback ? (process.env.RESEND_FROM_EMAIL || "resend-fallback") : account.email,
      toEmail: data.to,
      subject: data.subject,
      result: "SUCCESS",
      provider: usedFallback ? null : account.provider,
      providerId: sendResult.messageId,
      metadata: {
        campaignName: data.campaignName,
        campaignType: data.campaignType,
        hasReminders: data.remindersConfig?.enabled || false,
        usedResendFallback: usedFallback
      }
    })

    return {
      taskId: task.id,
      threadId,
      messageId: sendResult.messageId
    }
  }

  // Send an outbound email that belongs to an existing task (used for reminders)
  // Note: Reminders intentionally bypass rate limiting since they are scheduled follow-ups
  static async sendEmailForExistingTask(data: {
    taskId: string
    entityId: string
    organizationId: string
    to: string
    subject: string
    body: string
    htmlBody?: string
    accountId?: string
    // Threading params for replies
    inReplyTo?: string
    references?: string
    threadId?: string
  }): Promise<{ messageId: string }> {
    // Reminders bypass rate limiting - they are intentional scheduled follow-ups
    // The reminder system already has its own frequency controls
    
    // Resolve account (reuse same logic as sendEmail)
    let account: ConnectedEmailAccount | null = null

    if (data.accountId) {
      account = await EmailConnectionService.getById(data.accountId, data.organizationId)
      if (!account) {
        account = await prisma.connectedEmailAccount.findFirst({
          where: {
            id: data.accountId,
            organizationId: data.organizationId,
            isActive: true
          }
        })
      }
    } else {
      account = await EmailConnectionService.getFirstActive(data.organizationId)
      if (!account) {
        account = await EmailConnectionService.getPrimaryAccount(data.organizationId)
      }
    }

    if (!account) {
      throw new Error("No active email account found for reminder send")
    }

    const replyTo = account.email
    const trackingToken = TrackingPixelService.generateTrackingToken()
    const trackingUrl = TrackingPixelService.generateTrackingUrl(trackingToken)
    let htmlBodyWithTracking = data.htmlBody
    if (data.htmlBody) {
      htmlBodyWithTracking = TrackingPixelService.injectTrackingPixel(data.htmlBody, trackingUrl)
    }

    // Send email based on provider
    let sendResult: { messageId: string; providerData: any }

    if (account.provider === EmailProvider.GMAIL) {
      const provider = new GmailProvider()
      sendResult = await provider.sendEmail({
        account,
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo,
        // Pass threading headers for proper email thread grouping
        inReplyTo: data.inReplyTo,
        references: data.references,
        threadId: data.threadId
      })
    } else if (account.provider === EmailProvider.MICROSOFT) {
      const provider = new MicrosoftProvider()
      sendResult = await provider.sendEmail({
        account,
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo,
        // Pass threading headers for proper email thread grouping
        inReplyTo: data.inReplyTo,
        references: data.references,
        threadId: data.threadId
      })
    } else {
      // GENERIC_SMTP or fallback
      sendResult = await this.sendViaSMTP({
        account,
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo
      })
    }

    // Log outbound message against existing request/entity
    await RequestCreationService.logOutboundMessage({
      requestId: data.taskId,
      entityId: data.entityId,
      subject: data.subject,
      body: data.body,
      htmlBody: htmlBodyWithTracking,
      fromAddress: account.email,
      toAddress: data.to,
      providerId: sendResult.messageId,
      providerData: sendResult.providerData,
      trackingToken
    })

    // Audit log the successful reminder send
    await logEmailSendAudit({
      organizationId: data.organizationId,
      taskId: data.taskId,
      fromEmail: account.email,
      toEmail: data.to,
      subject: data.subject,
      result: "SUCCESS",
      provider: account.provider,
      providerId: sendResult.messageId,
      metadata: { type: "reminder" }
    })

    return { messageId: sendResult.messageId }
  }

  static async sendBulkEmail(data: {
    organizationId: string
    userId?: string          // User sending the email (for auto-selecting their account)
    jobId?: string | null    // Parent Job/Item for request-level association
    recipients: Array<{ email: string; name?: string }>
    subject: string
    body: string
    htmlBody?: string
    campaignName?: string
    campaignType?: string
    accountId?: string
    perRecipientEmails?: Array<{ email: string; subject: string; body: string; htmlBody: string }>
    deadlineDate?: Date | null
    remindersConfig?: {
      enabled: boolean
      startDelayHours: number
      frequencyHours: number
      maxCount: number
      approved: boolean
    }
    attachments?: Array<{ filename: string; content: string; contentType: string }>
  }): Promise<Array<{
    email: string
    taskId: string
    threadId: string
    messageId: string
    error?: string
  }>> {
    log.info("Starting bulk email send", {
      recipientCount: data.recipients.length,
      jobId: data.jobId,
      campaignName: data.campaignName
    }, { organizationId: data.organizationId, operation: "sendBulkEmail" })

    const results: Array<{ email: string; taskId: string; threadId: string; messageId: string; error?: string }> = []

    // Use deadlineDate directly from data (set by user via date picker)
    const deadlineDate = data.deadlineDate || null

    // Process recipients concurrently with a concurrency limit
    const sendOne = async (recipient: { email: string; name?: string }) => {
      try {
        const perRecipientEmail = data.perRecipientEmails?.find(e => e.email === recipient.email)
        const subjectToUse = perRecipientEmail?.subject || data.subject
        const bodyToUse = perRecipientEmail?.body || data.body
        const htmlBodyToUse = perRecipientEmail?.htmlBody || data.htmlBody

        const result = await this.sendEmail({
          organizationId: data.organizationId,
          userId: data.userId,
          jobId: data.jobId,
          to: recipient.email,
          toName: recipient.name,
          subject: subjectToUse,
          body: bodyToUse,
          htmlBody: htmlBodyToUse,
          campaignName: data.campaignName,
          campaignType: data.campaignType,
          accountId: data.accountId,
          deadlineDate,
          remindersConfig: data.remindersConfig,
          attachments: data.attachments
        })

        return { email: recipient.email, ...result }
      } catch (error: any) {
        log.error("Failed to send email to recipient", error, {
          email: recipient.email,
          campaignName: data.campaignName
        }, { organizationId: data.organizationId, operation: "sendBulkEmail" })

        let failedTaskId = ""
        try {
          const failedRequest = await RequestCreationService.createRequestFromEmail({
            organizationId: data.organizationId,
            taskInstanceId: data.jobId || null,
            entityEmail: recipient.email,
            entityName: recipient.name,
            campaignName: data.campaignName,
            campaignType: data.campaignType,
            requestType: "standard",
            threadId: `failed-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            replyToEmail: "failed@send",
            subject: data.perRecipientEmails?.find(e => e.email === recipient.email)?.subject || data.subject,
          })
          await prisma.request.update({
            where: { id: failedRequest.id },
            data: {
              status: "SEND_FAILED",
              aiReasoning: { error: error.message, failedAt: new Date().toISOString() }
            }
          })
          failedTaskId = failedRequest.id
        } catch (createErr: any) {
          log.error("Failed to create failed request record", createErr, {
            email: recipient.email
          }, { organizationId: data.organizationId, operation: "sendBulkEmail" })
        }

        return { email: recipient.email, taskId: failedTaskId, threadId: "", messageId: "", error: error.message }
      }
    }

    // Process in batches of BULK_SEND_CONCURRENCY with staggered starts
    for (let i = 0; i < data.recipients.length; i += BULK_SEND_CONCURRENCY) {
      const batch = data.recipients.slice(i, i + BULK_SEND_CONCURRENCY)
      const batchPromises = batch.map((recipient, idx) =>
        new Promise<typeof results[number]>(resolve =>
          setTimeout(() => resolve(sendOne(recipient)), idx * BULK_SEND_STAGGER_MS)
        )
      )
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    // Initialize reminder state for each successfully created task (idempotent)
    if (data.remindersConfig?.enabled) {
      const successfulRequestIds = results
        .map(r => r.taskId)
        .filter((id): id is string => Boolean(id))
      if (successfulRequestIds.length > 0) {
        for (const requestId of successfulRequestIds) {
          try {
            await ReminderStateService.initializeForRequest(requestId, data.remindersConfig)
          } catch (error: any) {
            log.error("Failed to initialize reminders for request", error, { requestId }, { organizationId: data.organizationId })
          }
        }
      }
    }

    return results
  }
}

