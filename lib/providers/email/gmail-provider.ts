import { google } from "googleapis"
import { OAuth2Client } from "google-auth-library"
import { EmailAccount } from "@prisma/client"
import { EmailProviderDriver, EmailSendParams, ContactSyncResult } from "./email-provider"
import { EmailAccountService } from "@/lib/services/email-account.service"
import { decrypt } from "@/lib/encryption"

export class GmailProvider implements EmailProviderDriver {
  private getClient(account: EmailAccount): OAuth2Client {
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

  async refreshToken(account: EmailAccount): Promise<EmailAccount> {
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
    return EmailAccountService.updateTokens(account.id, {
      accessToken: credentials.access_token || undefined,
      refreshToken: credentials.refresh_token || undefined,
      tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    })
  }

  async ensureValidToken(account: EmailAccount): Promise<EmailAccount> {
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

    const messageParts = [
      `To: ${params.to}`,
      `From: ${account.email}`,
      `Reply-To: ${params.replyTo}`,
      `Subject: ${params.subject}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      params.htmlBody || params.body,
    ]

    const message = messageParts.join("\n")
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    })

    return {
      messageId: response.data.id || "",
      providerData: response.data,
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

