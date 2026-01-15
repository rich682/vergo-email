import { EmailAccount } from "@prisma/client"
import { EmailProviderDriver, EmailSendParams, ContactSyncResult } from "./email-provider"
import { EmailAccountService } from "@/lib/services/email-account.service"
import { decrypt } from "@/lib/encryption"

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"

export class MicrosoftProvider implements EmailProviderDriver {
  private async getAccessToken(account: EmailAccount): Promise<{ token: string; refreshedAccount: EmailAccount }> {
    let current = account
    const now = Date.now()
    const expiry = current.tokenExpiresAt?.getTime() || 0
    if (!current.accessToken || !current.refreshToken || expiry < now + 5 * 60 * 1000) {
      current = await this.refreshToken(current)
    }
    const token = current.accessToken ? decrypt(current.accessToken) : ""
    return { token, refreshedAccount: current }
  }

  async refreshToken(account: EmailAccount): Promise<EmailAccount> {
    if (!account.refreshToken) {
      throw new Error("No refresh token available for Microsoft account")
    }
    const params = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID || "",
      client_secret: process.env.MS_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: decrypt(account.refreshToken),
      scope: "offline_access Mail.Send Mail.Read Mail.ReadBasic Contacts.Read",
    })
    const tenant = process.env.MS_TENANT_ID || "common"
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    if (!resp.ok) {
      const msg = await resp.text()
      throw new Error(`Failed to refresh Microsoft token: ${msg}`)
    }
    const data = await resp.json()
    const expiresInMs = data.expires_in ? Number(data.expires_in) * 1000 : 3600 * 1000
    return EmailAccountService.updateTokens(account.id, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || decrypt(account.refreshToken),
      tokenExpiresAt: new Date(Date.now() + expiresInMs),
    })
  }

  async sendEmail(params: EmailSendParams): Promise<{ messageId: string; providerData: any }> {
    const { token, refreshedAccount } = await this.getAccessToken(params.account)
    const body = {
      message: {
        subject: params.subject,
        body: {
          contentType: "HTML",
          content: params.htmlBody || params.body,
        },
        toRecipients: [{ emailAddress: { address: params.to } }],
        from: { emailAddress: { address: refreshedAccount.email } },
        replyTo: [{ emailAddress: { address: params.replyTo } }],
      },
      saveToSentItems: true,
    }
    const resp = await fetch(`${GRAPH_BASE}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const msg = await resp.text()
      throw new Error(`Microsoft sendMail failed: ${msg}`)
    }
    return { messageId: "", providerData: await resp.json().catch(() => ({})) }
  }

  async syncContacts(account: EmailAccount): Promise<ContactSyncResult & { contacts?: Array<{ name: string; email: string }> }> {
    const { token } = await this.getAccessToken(account)
    const resp = await fetch(`${GRAPH_BASE}/me/contacts?$select=id,displayName,emailAddresses`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) {
      const msg = await resp.text()
      throw new Error(`Microsoft contacts fetch failed: ${msg}`)
    }
    const data = await resp.json()
    const rawContacts = Array.isArray(data.value) ? data.value : []
    
    // Transform to simple format
    const contacts: Array<{ name: string; email: string }> = []
    for (const contact of rawContacts) {
      const email = contact.emailAddresses?.[0]?.address
      const name = contact.displayName || email?.split("@")[0] || "Unknown"
      if (email) {
        contacts.push({ name, email })
      }
    }
    
    return {
      imported: contacts.length,
      skipped: 0,
      message: "Contacts fetched",
      contacts
    }
  }
}

