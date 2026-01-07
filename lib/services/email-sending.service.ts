import { google } from "googleapis"
import nodemailer from "nodemailer"
import { EmailConnectionService } from "./email-connection.service"
import { TokenRefreshService } from "./token-refresh.service"
import { TaskCreationService } from "./task-creation.service"
import { TrackingPixelService } from "./tracking-pixel.service"
import { ConnectedEmailAccount } from "@prisma/client"
import { v4 as uuidv4 } from "uuid"
import { decrypt } from "@/lib/encryption"

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

    // Create email message
    const messageParts = [
      `To: ${data.to}`,
      `From: ${data.account.email}`,
      `Reply-To: ${data.replyTo}`,
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

    return {
      messageId: response.data.id || "",
      providerData: response.data
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
  }): Promise<{
    taskId: string
    threadId: string
    messageId: string
  }> {
    // Get email account (primary if not specified)
    let account: ConnectedEmailAccount | null
    if (data.accountId) {
      const { prisma } = await import("@/lib/prisma")
      account = await prisma.connectedEmailAccount.findFirst({
        where: {
          id: data.accountId,
          organizationId: data.organizationId,
          isActive: true
        }
      })
    } else {
      account = await EmailConnectionService.getPrimaryAccount(data.organizationId)
    }

    if (!account) {
      throw new Error("No active email account found")
    }

    // Generate thread ID and reply-to address
    const threadId = this.generateThreadId()
    const domain = this.extractDomainFromEmail(account.email)
    const replyTo = this.generateReplyToAddress(threadId, domain)

    // Generate tracking token and inject pixel if HTML body exists
    const trackingToken = TrackingPixelService.generateTrackingToken()
    const trackingUrl = TrackingPixelService.generateTrackingUrl(trackingToken)
    let htmlBodyWithTracking = data.htmlBody
    if (data.htmlBody) {
      htmlBodyWithTracking = TrackingPixelService.injectTrackingPixel(data.htmlBody, trackingUrl)
    }

    // Send email
    let sendResult: { messageId: string; providerData: any }
    
    if (account.provider === "GMAIL") {
      sendResult = await this.sendViaGmail({
        account,
        to: data.to,
        subject: data.subject,
        body: data.body,
        htmlBody: htmlBodyWithTracking,
        replyTo
      })
    } else {
      sendResult = await this.sendViaSMTP({
        account,
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
      subject: data.subject
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
  }): Promise<Array<{
    email: string
    taskId: string
    threadId: string
    messageId: string
    error?: string
  }>> {
    const results = []

    for (const recipient of data.recipients) {
      try {
        const result = await this.sendEmail({
          organizationId: data.organizationId,
          to: recipient.email,
          toName: recipient.name,
          subject: data.subject,
          body: data.body,
          htmlBody: data.htmlBody,
          campaignName: data.campaignName,
          campaignType: data.campaignType,
          accountId: data.accountId
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

