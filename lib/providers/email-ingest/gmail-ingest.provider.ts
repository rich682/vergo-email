import { google, gmail_v1 } from "googleapis"
import { simpleParser } from "mailparser"
import type { ConnectedEmailAccount } from "@prisma/client"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import {
  EmailIngestProvider,
  FetchInboundResult,
  NormalizedInboundMessage,
  ProviderCursor,
} from "./types"

const MAX_BOOTSTRAP_HOURS = 24

const isHistoryTooOldError = (error: any): boolean => {
  if (!error || typeof error !== "object") return false
  const code = (error as any).code
  const message = (error as any).message || ""
  return code === 404 || code === 400 || `${message}`.includes("HistoryId")
}

export class GmailIngestProvider implements EmailIngestProvider {
  async fetchInboundSinceCursor(
    account: ConnectedEmailAccount,
    cursor: ProviderCursor | null
  ): Promise<FetchInboundResult> {
    const oauth2Client = await EmailConnectionService.getGmailClient(account.id)
    if (!oauth2Client) {
      throw new Error("Failed to obtain Gmail client for account")
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client })
    const startCursor = cursor?.gmail?.historyId || null

    try {
      if (!startCursor) {
        return await this.bootstrapAndScanRecent(gmail, account)
      }

      return await this.fetchFromHistory(gmail, account, startCursor)
    } catch (error: any) {
      if (isHistoryTooOldError(error)) {
        console.warn(
          "[GmailIngest] startHistoryId invalid or too old; bootstrapping",
          error?.message
        )
        return await this.bootstrapAndScanRecent(gmail, account)
      }
      throw error
    }
  }

  async bootstrapCursor(
    account: ConnectedEmailAccount
  ): Promise<ProviderCursor | null> {
    const oauth2Client = await EmailConnectionService.getGmailClient(account.id)
    if (!oauth2Client) return null
    const gmail = google.gmail({ version: "v1", auth: oauth2Client })
    const profile = await gmail.users.getProfile({ userId: "me" })
    const historyId = profile.data.historyId
    return historyId ? { gmail: { historyId: String(historyId) } } : null
  }

  async normalizeRawMessage(
    account: ConnectedEmailAccount,
    rawMessage: gmail_v1.Schema$Message
  ): Promise<NormalizedInboundMessage | null> {
    if (!rawMessage.id || !rawMessage.raw) return null

    const parsed = await simpleParser(Buffer.from(rawMessage.raw, "base64"))

    const getAddressText = (addr: any): string => {
      if (!addr) return ""
      if (typeof addr === "string") return addr
      if (Array.isArray(addr)) return addr[0]?.text || addr[0]?.address || ""
      return addr.text || addr.address || ""
    }

    const inReplyToHeader =
      parsed.headers.get("in-reply-to") ||
      parsed.headers.get("In-Reply-To") ||
      ""
    const referencesHeader =
      parsed.headers.get("references") ||
      parsed.headers.get("References") ||
      ""
    const messageIdHeader =
      parsed.headers.get("message-id") || parsed.headers.get("Message-ID")

    const extractMessageId = (header: string): string | null => {
      if (!header) return null
      const match = header.match(/<([^>]+)>/)
      return match ? match[1] : null
    }

    const inReplyToMessageId = extractMessageId(
      typeof inReplyToHeader === "string" ? inReplyToHeader : ""
    )
    const threadId = rawMessage.threadId || null
    const receivedAt =
      rawMessage.internalDate && !Number.isNaN(Number(rawMessage.internalDate))
        ? new Date(Number(rawMessage.internalDate))
        : undefined

    const attachments =
      parsed.attachments?.map((att: any) => ({
        filename: att.filename || "attachment",
        content: att.content as Buffer,
        contentType: att.contentType || "application/octet-stream",
      })) || undefined

    // Filter out outbound messages (from the connected account)
    const fromAddress = getAddressText(parsed.from)
    if (
      fromAddress &&
      account.email &&
      fromAddress.toLowerCase().includes(account.email.toLowerCase())
    ) {
      return null
    }

    return {
      provider: "GMAIL",
      accountId: account.id,
      providerId: rawMessage.id,
      messageIdHeader:
        typeof messageIdHeader === "string" ? messageIdHeader : null,
      threadId,
      inReplyTo: inReplyToMessageId,
      references: typeof referencesHeader === "string" ? referencesHeader : null,
      from: fromAddress,
      to: getAddressText(parsed.to),
      replyTo: parsed.replyTo ? getAddressText(parsed.replyTo) : null,
      subject: parsed.subject || null,
      body: parsed.text || null,
      htmlBody: parsed.html || null,
      receivedAt,
      attachments,
      providerData: {
        provider: "GMAIL",
        ...rawMessage,
        inReplyTo: inReplyToMessageId,
        references: referencesHeader,
        threadId,
        historyId: rawMessage.historyId,
      },
    }
  }

  private async fetchFromHistory(
    gmail: gmail_v1.Gmail,
    account: ConnectedEmailAccount,
    startHistoryId: string
  ): Promise<FetchInboundResult> {
    let pageToken: string | undefined
    const messageIds = new Set<string>()
    let lastHistoryId: string | null = null
    let historyPageCount = 0

    do {
      const historyResponse = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        pageToken,
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
      })
      historyPageCount++

      const history = historyResponse.data.history || []
      for (const entry of history) {
        if (entry.id) {
          lastHistoryId = String(entry.id)
        }
        const addedMessages = entry.messagesAdded || []
        for (const added of addedMessages) {
          const msg = added.message
          if (msg?.id) {
            messageIds.add(msg.id)
          }
        }
      }

      pageToken = historyResponse.data.nextPageToken || undefined
    } while (pageToken)

    const messages: NormalizedInboundMessage[] = []
    for (const messageId of messageIds) {
      const normalized = await this.fetchAndNormalizeMessage(
        gmail,
        account,
        messageId
      )
      if (normalized) {
        messages.push(normalized)
      }
    }

    console.log(
      JSON.stringify({
        event: "gmail_history_fetch",
        accountId: account.id,
        startHistoryId,
        historyPages: historyPageCount,
        messageIds: Array.from(messageIds),
      })
    )

    const nextCursor = lastHistoryId
      ? { gmail: { historyId: String(lastHistoryId) } }
      : { gmail: { historyId: String(startHistoryId) } }

    return {
      messages,
      nextCursor,
      historyPageCount,
      bootstrapPerformed: false,
    }
  }

  private async bootstrapAndScanRecent(
    gmail: gmail_v1.Gmail,
    account: ConnectedEmailAccount
  ): Promise<FetchInboundResult> {
    const messages: NormalizedInboundMessage[] = []
    const afterSeconds =
      Math.floor(Date.now() / 1000) - MAX_BOOTSTRAP_HOURS * 60 * 60
    let pageToken: string | undefined

    do {
      const listResp = await gmail.users.messages.list({
        userId: "me",
        q: `in:inbox after:${afterSeconds}`,
        pageToken,
      })

      const ids =
        listResp.data.messages?.map((m) => m.id).filter(Boolean) || []
      for (const id of ids) {
        const normalized = await this.fetchAndNormalizeMessage(
          gmail,
          account,
          id as string
        )
        if (normalized) {
          messages.push(normalized)
        }
      }

      pageToken = listResp.data.nextPageToken || undefined
    } while (pageToken)

    const profile = await gmail.users.getProfile({ userId: "me" })
    const historyId = profile.data.historyId

    console.log(
      JSON.stringify({
        event: "gmail_bootstrap_scan",
        accountId: account.id,
        hoursLookback: MAX_BOOTSTRAP_HOURS,
        messagesFound: messages.length,
        historyId: historyId ? String(historyId) : null,
      })
    )

    return {
      messages,
      nextCursor: historyId ? { gmail: { historyId: String(historyId) } } : null,
      bootstrapPerformed: true,
    }
  }

  private async fetchAndNormalizeMessage(
    gmail: gmail_v1.Gmail,
    account: ConnectedEmailAccount,
    messageId: string
  ): Promise<NormalizedInboundMessage | null> {
    const fullMessage = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "raw",
    })

    if (!fullMessage.data.raw) {
      return null
    }

    return this.normalizeRawMessage(account, fullMessage.data)
  }
}

