import { google } from "googleapis"
import { OAuth2Client } from "google-auth-library"
import { ConnectedEmailAccount } from "@prisma/client"
import { EmailProviderDriver, EmailSendParams, ContactSyncResult } from "./email-provider"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { decrypt } from "@/lib/encryption"

export class GmailProvider implements EmailProviderDriver {
  private getClient(account: ConnectedEmailAccount): OAuth2Client {
    const client = new OAuth2Client(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    )
    const creds = {
      access_token: account.accessToken ? decrypt(account.accessToken) : undefined,
      refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined,
      expiry_date: account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : undefined,
    }
    client.setCredentials(creds)
    return client
  }

  async refreshToken(account: ConnectedEmailAccount): Promise<ConnectedEmailAccount> {
    if (!account.refreshToken) {
      throw new Error("No refresh token available")
    }
    const client = new OAuth2Client(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    )
    client.setCredentials({
      refresh_token: decrypt(account.refreshToken),
    })
    const { credentials } = await client.refreshAccessToken()
    return EmailConnectionService.updateTokens(account.id, {
      accessToken: credentials.access_token || undefined,
      refreshToken: credentials.refresh_token || undefined,
      tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    })
  }

  async ensureValidToken(account: ConnectedEmailAccount): Promise<ConnectedEmailAccount> {
    const now = Date.now()
    const expiry = account.tokenExpiresAt?.getTime() || 0
    if (!expiry || expiry < now + 5 * 60 * 1000) {
      return this.refreshToken(account)
    }
    return account
  }

  async sendEmail(params: EmailSendParams): Promise<{ messageId: string; providerData: any }> {
    let account = params.account
    account = await this.ensureValidToken(account)
    const oauth2Client = this.getClient(account)
    const gmail = google.gmail({ version: "v1", auth: oauth2Client })

    // Generate a Message-ID header for tracking (Gmail will use this in In-Reply-To when someone replies)
    // Format: <unique-id@domain> where domain should match the sender's domain
    const messageIdHeader = `<${Date.now()}-${Math.random().toString(36).substring(2, 15)}@${account.email.split('@')[1] || 'gmail.com'}>`

    // Build message headers - include threading headers if this is a reply
    const messageParts = [
      `To: ${params.to}`,
      `From: ${account.email}`,
      `Reply-To: ${params.replyTo}`,
      `Message-ID: ${messageIdHeader}`,
      `Subject: ${params.subject}`,
    ]

    // Add In-Reply-To header for threading (critical for email clients to group as thread)
    if (params.inReplyTo) {
      // Ensure proper format with angle brackets
      const inReplyToFormatted = params.inReplyTo.startsWith('<') ? params.inReplyTo : `<${params.inReplyTo}>`
      messageParts.push(`In-Reply-To: ${inReplyToFormatted}`)
    }

    // Add References header for threading (chain of message IDs)
    if (params.references) {
      messageParts.push(`References: ${params.references}`)
    } else if (params.inReplyTo) {
      // If no references but we have inReplyTo, use that as references
      const inReplyToFormatted = params.inReplyTo.startsWith('<') ? params.inReplyTo : `<${params.inReplyTo}>`
      messageParts.push(`References: ${inReplyToFormatted}`)
    }

    messageParts.push(
      "Content-Type: text/html; charset=utf-8",
      "",
      params.htmlBody || params.body,
    )

    const message = messageParts.join("\n")
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")

    // If we have a threadId, include it so Gmail adds to the same thread
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { 
        raw: encodedMessage,
        threadId: params.threadId || undefined  // Gmail will add to existing thread if provided
      },
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
        const parsedSent = await import("mailparser").then(m => m.simpleParser(Buffer.from(sentMessage.data.raw!, "base64")))
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
      },
    }
  }

  async syncContacts(account: EmailAccount): Promise<ContactSyncResult> {
    // Minimal stub: ensure token exists and return informative message.
    if (!account.accessToken) {
      throw new Error("No access token available for Gmail contact sync")
    }
    // TODO: Implement People API sync; for now, return stub to keep contract.
    return {
      imported: 0,
      skipped: 0,
      message: "Gmail contact sync not yet implemented",
    }
  }
}


