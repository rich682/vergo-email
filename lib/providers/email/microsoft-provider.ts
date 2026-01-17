import { ConnectedEmailAccount } from "@prisma/client"
import { EmailProviderDriver, EmailSendParams, ContactSyncResult } from "./email-provider"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { decrypt } from "@/lib/encryption"

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"

export class MicrosoftProvider implements EmailProviderDriver {
  private async getAccessToken(account: ConnectedEmailAccount): Promise<{ token: string; refreshedAccount: ConnectedEmailAccount }> {
    let current = account
    const now = Date.now()
    const expiry = current.tokenExpiresAt?.getTime() || 0
    if (!current.accessToken || !current.refreshToken || expiry < now + 5 * 60 * 1000) {
      current = await this.refreshToken(current)
    }
    const token = current.accessToken ? decrypt(current.accessToken) : ""
    return { token, refreshedAccount: current }
  }

  async refreshToken(account: ConnectedEmailAccount): Promise<ConnectedEmailAccount> {
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
    return EmailConnectionService.updateTokens(account.id, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || decrypt(account.refreshToken),
      tokenExpiresAt: new Date(Date.now() + expiresInMs),
    })
  }

  async sendEmail(params: EmailSendParams): Promise<{ messageId: string; providerData: any }> {
    const { token, refreshedAccount } = await this.getAccessToken(params.account)
    
    // Generate a unique Message-ID for tracking
    const domain = refreshedAccount.email.split('@')[1] || 'outlook.com'
    const generatedMessageId = `<${Date.now()}-${Math.random().toString(36).substring(2, 15)}@${domain}>`
    
    // Build internet message headers for threading
    const internetMessageHeaders: Array<{ name: string; value: string }> = []
    
    // Add In-Reply-To header for threading (critical for email clients to group as thread)
    if (params.inReplyTo) {
      const inReplyToFormatted = params.inReplyTo.startsWith('<') ? params.inReplyTo : `<${params.inReplyTo}>`
      internetMessageHeaders.push({ name: "In-Reply-To", value: inReplyToFormatted })
    }
    
    // Add References header for threading
    if (params.references) {
      internetMessageHeaders.push({ name: "References", value: params.references })
    } else if (params.inReplyTo) {
      // If no references but we have inReplyTo, use that as references
      const inReplyToFormatted = params.inReplyTo.startsWith('<') ? params.inReplyTo : `<${params.inReplyTo}>`
      internetMessageHeaders.push({ name: "References", value: inReplyToFormatted })
    }
    
    const body: any = {
      message: {
        subject: params.subject,
        body: {
          contentType: "HTML",
          content: params.htmlBody || params.body,
        },
        toRecipients: [{ emailAddress: { address: params.to } }],
        from: { emailAddress: { address: refreshedAccount.email } },
        replyTo: [{ emailAddress: { address: params.replyTo } }],
        // Set custom internet message ID for reply tracking
        internetMessageId: generatedMessageId,
      },
      saveToSentItems: true,
    }
    
    // Add threading headers if we're replying
    if (internetMessageHeaders.length > 0) {
      body.message.internetMessageHeaders = internetMessageHeaders
    }
    
    // If we have a conversationId/threadId, try to use the reply endpoint for proper threading
    // Note: Microsoft Graph doesn't have a direct "add to conversation" like Gmail's threadId
    
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
    
    // Try to get the actual sent message from Sent Items to get the real internetMessageId
    let actualMessageId = generatedMessageId
    try {
      // Wait a moment for the message to appear in Sent Items
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Search for the recently sent message
      const searchResp = await fetch(
        `${GRAPH_BASE}/me/mailFolders/sentItems/messages?$filter=subject eq '${encodeURIComponent(params.subject)}'&$select=id,internetMessageId,conversationId&$top=1&$orderby=sentDateTime desc`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      
      if (searchResp.ok) {
        const searchData = await searchResp.json()
        if (searchData.value && searchData.value.length > 0) {
          const sentMessage = searchData.value[0]
          actualMessageId = sentMessage.internetMessageId || generatedMessageId
          console.log(`[Microsoft] Retrieved sent message ID: ${actualMessageId}, conversationId: ${sentMessage.conversationId}`)
          
          return {
            messageId: sentMessage.id || "",
            providerData: {
              id: sentMessage.id,
              internetMessageId: actualMessageId,
              messageIdHeader: actualMessageId,
              conversationId: sentMessage.conversationId,
            }
          }
        }
      }
    } catch (e) {
      console.warn("[Microsoft] Could not fetch sent message to get actual Message-ID, using generated one:", e)
    }
    
    return { 
      messageId: "", 
      providerData: {
        messageIdHeader: actualMessageId,
        internetMessageId: actualMessageId,
      }
    }
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

