import { google } from "googleapis"
import nodemailer from "nodemailer"
import { EmailConnectionService } from "./email-connection.service"
import { TokenRefreshService } from "./token-refresh.service"
import { TaskCreationService } from "./task-creation.service"
import { TrackingPixelService } from "./tracking-pixel.service"
import { ConnectedEmailAccount, EmailAccount, EmailProvider } from "@prisma/client"
import { v4 as uuidv4 } from "uuid"
import { decrypt } from "@/lib/encryption"
import { EmailAccountService } from "./email-account.service"
import { GmailProvider } from "@/lib/providers/email/gmail-provider"
import { MicrosoftProvider } from "@/lib/providers/email/microsoft-provider"

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
      replyTo: data.replyTo
    }

    const info = await transporter.sendMail(mailOptions)

    return {
      messageId: info.messageId || "",
      providerData: info
    }
  }

  static async sendEmail(data: {
    organizationId: string
    to: string
    toName?: string
    subject: string
    body: string
    htmlBody?: string
    campaignName?: string
    campaignType?: string
    accountId?: string
    deadlineDate?: Date | null
  }): Promise<{
    taskId: string
    threadId: string
    messageId: string
  }> {
    // Resolve EmailAccount first (multi-inbox), fallback to legacy ConnectedEmailAccount
    let account: EmailAccount | ConnectedEmailAccount | null = null

    if (data.accountId) {
      account = await EmailAccountService.getById(data.accountId, data.organizationId)
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
    } else {
      account = await EmailAccountService.getFirstActive(data.organizationId)
      if (!account) {
        account = await EmailConnectionService.getPrimaryAccount(data.organizationId)
      }
    }

    if (!account) {
      throw new Error("No active email account found")
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

    // Send email
    let sendResult: { messageId: string; providerData: any }
    
    if ("provider" in account && (account as EmailAccount).provider === EmailProvider.GMAIL && "tokenExpiresAt" in account) {
      const provider = new GmailProvider()
      sendResult = await provider.sendEmail({
        account: account as EmailAccount,
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo
      })
    } else if ("provider" in account && (account as EmailAccount).provider === EmailProvider.MICROSOFT) {
      const provider = new MicrosoftProvider()
      sendResult = await provider.sendEmail({
        account: account as EmailAccount,
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo
      })
    } else if ((account as ConnectedEmailAccount).provider === "GMAIL") {
      sendResult = await this.sendViaGmail({
        account: account as ConnectedEmailAccount,
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo
      })
    } else {
      sendResult = await this.sendViaSMTP({
        account: account as ConnectedEmailAccount,
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo
      })
    }

    // Create task
    const task = await TaskCreationService.createTaskFromEmail({
      organizationId: data.organizationId,
      entityEmail: data.to,
      entityName: data.toName,
      campaignName: data.campaignName,
      campaignType: data.campaignType,
      threadId,
      replyToEmail: replyTo,
      subject: data.subject,
      deadlineDate: data.deadlineDate || null
    })

    // Log outbound message with tracking token
    await TaskCreationService.logOutboundMessage({
      taskId: task.id,
      entityId: task.entityId,
      subject: data.subject,
      body: data.body,
      htmlBody: htmlBodyWithTracking,
      fromAddress: account.email,
      toAddress: data.to,
      providerId: sendResult.messageId,
      providerData: sendResult.providerData,
      trackingToken
    })

    return {
      taskId: task.id,
      threadId,
      messageId: sendResult.messageId
    }
  }

  static async sendBulkEmail(data: {
    organizationId: string
    recipients: Array<{ email: string; name?: string }>
    subject: string
    body: string
    htmlBody?: string
    campaignName?: string
    campaignType?: string
    accountId?: string
    perRecipientEmails?: Array<{ email: string; subject: string; body: string; htmlBody: string }>
    deadlineDays?: number | null
  }): Promise<Array<{
    email: string
    taskId: string
    threadId: string
    messageId: string
    error?: string
  }>> {
    const results = []

    // Calculate deadlineDate if deadlineDays is provided (deadlineDate = now + deadlineDays)
    const deadlineDate = data.deadlineDays ? (() => {
      const deadline = new Date()
      deadline.setDate(deadline.getDate() + data.deadlineDays)
      return deadline
    })() : null

    for (const recipient of data.recipients) {
      try {
        // Use per-recipient email if provided, otherwise use default
        const perRecipientEmail = data.perRecipientEmails?.find(e => e.email === recipient.email)
        const subjectToUse = perRecipientEmail?.subject || data.subject
        const bodyToUse = perRecipientEmail?.body || data.body
        const htmlBodyToUse = perRecipientEmail?.htmlBody || data.htmlBody

        const result = await this.sendEmail({
          organizationId: data.organizationId,
          to: recipient.email,
          toName: recipient.name,
          subject: subjectToUse,
          body: bodyToUse,
          htmlBody: htmlBodyToUse,
          campaignName: data.campaignName,
          campaignType: data.campaignType,
          accountId: data.accountId,
          deadlineDate
        })

        results.push({
          email: recipient.email,
          ...result
        })
      } catch (error: any) {
        results.push({
          email: recipient.email,
          taskId: "",
          threadId: "",
          messageId: "",
          error: error.message
        })
      }
    }

    return results
  }
}

