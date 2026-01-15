import type { ConnectedEmailAccount } from "@prisma/client"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import type {
  EmailIngestProvider,
  FetchInboundResult,
  NormalizedInboundMessage,
  ProviderCursor,
} from "./types"

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const MAX_BOOTSTRAP_HOURS = 24

/**
 * Microsoft Graph API message type
 */
interface GraphMessage {
  id: string
  conversationId?: string
  internetMessageId?: string
  subject?: string
  bodyPreview?: string
  body?: {
    contentType: string
    content: string
  }
  from?: {
    emailAddress: {
      name?: string
      address: string
    }
  }
  toRecipients?: Array<{
    emailAddress: {
      name?: string
      address: string
    }
  }>
  replyTo?: Array<{
    emailAddress: {
      name?: string
      address: string
    }
  }>
  receivedDateTime?: string
  hasAttachments?: boolean
  attachments?: Array<{
    id: string
    name: string
    contentType: string
    size: number
    contentBytes?: string
    "@odata.mediaContentLink"?: string
  }>
  internetMessageHeaders?: Array<{
    name: string
    value: string
  }>
}

/**
 * Microsoft Graph delta response
 */
interface GraphDeltaResponse {
  value: GraphMessage[]
  "@odata.nextLink"?: string
  "@odata.deltaLink"?: string
}

export class MicrosoftIngestProvider implements EmailIngestProvider {
  /**
   * Fetch inbound messages since the last cursor position.
   * Uses Microsoft Graph delta queries for incremental sync.
   */
  async fetchInboundSinceCursor(
    account: ConnectedEmailAccount,
    cursor: ProviderCursor | null
  ): Promise<FetchInboundResult> {
    const tokenResult = await EmailConnectionService.getMicrosoftAccessToken(account.id)
    if (!tokenResult) {
      throw new Error("Failed to obtain Microsoft access token for account")
    }

    const { token } = tokenResult
    const deltaLink = cursor?.microsoft?.deltaLink || null

    try {
      if (!deltaLink) {
        // No cursor - bootstrap with recent messages
        return await this.bootstrapAndScanRecent(token, account)
      }

      // Use delta link for incremental sync
      return await this.fetchFromDelta(token, account, deltaLink)
    } catch (error: any) {
      // If delta link is invalid or expired, bootstrap
      if (this.isDeltaExpiredError(error)) {
        console.warn(
          "[MicrosoftIngest] Delta link expired or invalid; bootstrapping",
          error?.message
        )
        return await this.bootstrapAndScanRecent(token, account)
      }
      throw error
    }
  }

  /**
   * Bootstrap cursor by getting initial delta link.
   */
  async bootstrapCursor(
    account: ConnectedEmailAccount
  ): Promise<ProviderCursor | null> {
    const tokenResult = await EmailConnectionService.getMicrosoftAccessToken(account.id)
    if (!tokenResult) return null

    const { token } = tokenResult

    // Get initial delta link without fetching all messages
    const url = `${GRAPH_BASE}/me/mailFolders/inbox/messages/delta?$select=id&$top=1`
    const response = await this.graphFetch(url, token)

    if (!response.ok) {
      console.error("[MicrosoftIngest] Failed to bootstrap cursor")
      return null
    }

    const data: GraphDeltaResponse = await response.json()
    
    // Follow nextLink pages to get to deltaLink
    let deltaLink = data["@odata.deltaLink"]
    let nextLink = data["@odata.nextLink"]

    while (nextLink && !deltaLink) {
      const nextResponse = await this.graphFetch(nextLink, token)
      if (!nextResponse.ok) break
      const nextData: GraphDeltaResponse = await nextResponse.json()
      deltaLink = nextData["@odata.deltaLink"]
      nextLink = nextData["@odata.nextLink"]
    }

    return deltaLink ? { microsoft: { deltaLink } } : null
  }

  /**
   * Normalize a Microsoft Graph message to our standard format.
   */
  async normalizeRawMessage(
    account: ConnectedEmailAccount,
    rawMessage: GraphMessage
  ): Promise<NormalizedInboundMessage | null> {
    if (!rawMessage.id) return null

    const fromAddress = rawMessage.from?.emailAddress?.address || ""
    const toAddress = rawMessage.toRecipients?.[0]?.emailAddress?.address || ""
    const replyToAddress = rawMessage.replyTo?.[0]?.emailAddress?.address || null

    // Filter out outbound messages (from the connected account)
    if (
      fromAddress &&
      account.email &&
      fromAddress.toLowerCase() === account.email.toLowerCase()
    ) {
      return null
    }

    // Extract headers for threading
    const headers = rawMessage.internetMessageHeaders || []
    const inReplyToHeader = headers.find(h => 
      h.name.toLowerCase() === "in-reply-to"
    )?.value || null
    const referencesHeader = headers.find(h => 
      h.name.toLowerCase() === "references"
    )?.value || null

    // Extract message ID from header
    const extractMessageId = (header: string | null): string | null => {
      if (!header) return null
      const match = header.match(/<([^>]+)>/)
      return match ? match[1] : null
    }

    const inReplyTo = extractMessageId(inReplyToHeader)

    // Parse received date
    const receivedAt = rawMessage.receivedDateTime
      ? new Date(rawMessage.receivedDateTime)
      : undefined

    // Extract body content
    const isHtml = rawMessage.body?.contentType === "html"
    const bodyContent = rawMessage.body?.content || ""

    // Process attachments if present
    let attachments: Array<{
      filename: string
      content: Buffer
      contentType: string
    }> | undefined

    if (rawMessage.hasAttachments && rawMessage.attachments) {
      attachments = []
      for (const att of rawMessage.attachments) {
        if (att.contentBytes) {
          attachments.push({
            filename: att.name || "attachment",
            content: Buffer.from(att.contentBytes, "base64"),
            contentType: att.contentType || "application/octet-stream",
          })
        }
      }
      if (attachments.length === 0) {
        attachments = undefined
      }
    }

    return {
      provider: "MICROSOFT",
      accountId: account.id,
      providerId: rawMessage.id,
      messageIdHeader: rawMessage.internetMessageId || null,
      threadId: rawMessage.conversationId || null,
      inReplyTo,
      references: referencesHeader,
      from: fromAddress,
      to: toAddress,
      replyTo: replyToAddress,
      subject: rawMessage.subject || null,
      body: isHtml ? null : bodyContent,
      htmlBody: isHtml ? bodyContent : null,
      receivedAt,
      attachments,
      providerData: {
        provider: "MICROSOFT",
        id: rawMessage.id,
        conversationId: rawMessage.conversationId,
        internetMessageId: rawMessage.internetMessageId,
        inReplyTo,
        references: referencesHeader,
        hasAttachments: rawMessage.hasAttachments,
      },
    }
  }

  /**
   * Fetch messages using delta link for incremental sync.
   */
  private async fetchFromDelta(
    token: string,
    account: ConnectedEmailAccount,
    deltaLink: string
  ): Promise<FetchInboundResult> {
    const messages: NormalizedInboundMessage[] = []
    let currentUrl: string | null = deltaLink
    let newDeltaLink: string | null = null
    let pageCount = 0

    while (currentUrl) {
      const response = await this.graphFetch(currentUrl, token)
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Microsoft Graph delta fetch failed: ${errorText}`)
      }

      const data: GraphDeltaResponse = await response.json()
      pageCount++

      // Process messages from this page
      for (const msg of data.value || []) {
        // Fetch full message with attachments if needed
        const fullMessage = await this.fetchFullMessage(token, msg.id)
        if (fullMessage) {
          const normalized = await this.normalizeRawMessage(account, fullMessage)
          if (normalized) {
            messages.push(normalized)
          }
        }
      }

      // Check for next page or delta link
      if (data["@odata.deltaLink"]) {
        newDeltaLink = data["@odata.deltaLink"]
        currentUrl = null
      } else if (data["@odata.nextLink"]) {
        currentUrl = data["@odata.nextLink"]
      } else {
        currentUrl = null
      }
    }

    console.log(
      JSON.stringify({
        event: "microsoft_delta_fetch",
        accountId: account.id,
        pages: pageCount,
        messagesFound: messages.length,
      })
    )

    return {
      messages,
      nextCursor: newDeltaLink
        ? { microsoft: { deltaLink: newDeltaLink } }
        : { microsoft: { deltaLink } },
      historyPageCount: pageCount,
      bootstrapPerformed: false,
    }
  }

  /**
   * Bootstrap by scanning recent inbox messages.
   */
  private async bootstrapAndScanRecent(
    token: string,
    account: ConnectedEmailAccount
  ): Promise<FetchInboundResult> {
    const messages: NormalizedInboundMessage[] = []
    
    // Calculate time filter for recent messages
    const afterDate = new Date(Date.now() - MAX_BOOTSTRAP_HOURS * 60 * 60 * 1000)
    const afterFilter = afterDate.toISOString()

    // Initial delta request with time filter
    let url = `${GRAPH_BASE}/me/mailFolders/inbox/messages/delta?$filter=receivedDateTime ge ${afterFilter}&$select=id,subject,from,toRecipients,replyTo,receivedDateTime,body,conversationId,internetMessageId,hasAttachments,internetMessageHeaders&$expand=attachments&$top=50`
    
    let deltaLink: string | null = null
    let pageCount = 0

    while (url) {
      const response = await this.graphFetch(url, token)
      
      if (!response.ok) {
        // If filter fails, try without it
        if (pageCount === 0) {
          url = `${GRAPH_BASE}/me/mailFolders/inbox/messages/delta?$select=id,subject,from,toRecipients,replyTo,receivedDateTime,body,conversationId,internetMessageId,hasAttachments,internetMessageHeaders&$expand=attachments&$top=50`
          continue
        }
        const errorText = await response.text()
        throw new Error(`Microsoft Graph bootstrap failed: ${errorText}`)
      }

      const data: GraphDeltaResponse = await response.json()
      pageCount++

      // Process messages
      for (const msg of data.value || []) {
        // Check if message is within our time window
        if (msg.receivedDateTime) {
          const receivedDate = new Date(msg.receivedDateTime)
          if (receivedDate < afterDate) {
            continue
          }
        }

        const normalized = await this.normalizeRawMessage(account, msg)
        if (normalized) {
          messages.push(normalized)
        }
      }

      // Check for next page or delta link
      if (data["@odata.deltaLink"]) {
        deltaLink = data["@odata.deltaLink"]
        url = ""
      } else if (data["@odata.nextLink"]) {
        url = data["@odata.nextLink"]
      } else {
        url = ""
      }

      // Limit bootstrap to reasonable number of pages
      if (pageCount >= 10) {
        break
      }
    }

    // If we didn't get a delta link, get one now
    if (!deltaLink) {
      const cursorResult = await this.bootstrapCursor(account)
      deltaLink = cursorResult?.microsoft?.deltaLink || null
    }

    console.log(
      JSON.stringify({
        event: "microsoft_bootstrap_scan",
        accountId: account.id,
        hoursLookback: MAX_BOOTSTRAP_HOURS,
        messagesFound: messages.length,
        pages: pageCount,
        hasDeltaLink: !!deltaLink,
      })
    )

    return {
      messages,
      nextCursor: deltaLink ? { microsoft: { deltaLink } } : null,
      bootstrapPerformed: true,
    }
  }

  /**
   * Fetch a full message with attachments.
   */
  private async fetchFullMessage(
    token: string,
    messageId: string
  ): Promise<GraphMessage | null> {
    const url = `${GRAPH_BASE}/me/messages/${messageId}?$select=id,subject,from,toRecipients,replyTo,receivedDateTime,body,conversationId,internetMessageId,hasAttachments,internetMessageHeaders&$expand=attachments`
    
    const response = await this.graphFetch(url, token)
    
    if (!response.ok) {
      console.warn(`[MicrosoftIngest] Failed to fetch message ${messageId}`)
      return null
    }

    return response.json()
  }

  /**
   * Make an authenticated request to Microsoft Graph API.
   */
  private async graphFetch(url: string, token: string): Promise<Response> {
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })
  }

  /**
   * Check if error indicates delta link is expired or invalid.
   */
  private isDeltaExpiredError(error: any): boolean {
    if (!error || typeof error !== "object") return false
    const message = error.message || ""
    return (
      message.includes("resyncRequired") ||
      message.includes("deltaToken") ||
      message.includes("410") ||
      message.includes("Gone")
    )
  }
}
