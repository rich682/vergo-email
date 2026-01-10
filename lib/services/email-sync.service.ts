/**
 * Email Sync Service - Polls Gmail for new messages as a fallback when push notifications aren't working
 * This can be called manually via API or scheduled via Inngest
 */

import { google } from "googleapis"
import { EmailConnectionService } from "./email-connection.service"
import { EmailReceptionService } from "./email-reception.service"
import { prisma } from "@/lib/prisma"
import { simpleParser } from "mailparser"

export class EmailSyncService {
  /**
   * Sync all Gmail accounts for new messages in threads we're tracking
   * This checks for new messages in Gmail threads that correspond to our tasks
   */
  static async syncGmailAccounts(): Promise<{ processed: number; errors: number }> {
    const accounts = await prisma.connectedEmailAccount.findMany({
      where: {
        provider: "GMAIL",
        isActive: true
      }
    })

    let processed = 0
    let errors = 0

    for (const account of accounts) {
      try {
        const result = await this.syncGmailAccount(account.id)
        processed += result.processed
        errors += result.errors
      } catch (error: any) {
        console.error(`[Email Sync] Error syncing account ${account.id}:`, error)
        errors++
      }
    }

    return { processed, errors }
  }

  /**
   * Sync a specific Gmail account for new messages
   */
  static async syncGmailAccount(accountId: string): Promise<{ processed: number; errors: number }> {
    const oauth2Client = await EmailConnectionService.getGmailClient(accountId)
    if (!oauth2Client) {
      throw new Error("Failed to get Gmail client")
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client })

    // Get all outbound messages we've sent (to find Gmail thread IDs)
    const ourOutboundMessages = await prisma.message.findMany({
      where: {
        direction: "OUTBOUND",
        providerData: { not: null }
      },
      select: {
        id: true,
        taskId: true,
        providerData: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100 // Limit to recent messages to avoid too many API calls
    })

    const gmailThreadIds = new Set<string>()
    for (const msg of ourOutboundMessages) {
      const providerData = msg.providerData as any
      if (providerData?.threadId) {
        gmailThreadIds.add(providerData.threadId)
      }
    }

    console.log(`[Email Sync] Found ${gmailThreadIds.size} Gmail threads to check for account ${accountId}`)

    let processed = 0
    let errors = 0

    // For each Gmail thread, check for new messages we haven't processed yet
    for (const threadId of gmailThreadIds) {
      try {
        const thread = await gmail.users.threads.get({
          userId: "me",
          id: threadId
        })

        if (!thread.data.messages) continue

        // Get all Gmail message IDs we've already processed
        const existingProviderIds = await prisma.message.findMany({
          where: {
            providerId: { in: thread.data.messages.map((m: any) => m.id) }
          },
          select: {
            providerId: true
          }
        })

        const existingIds = new Set(existingProviderIds.map(m => m.providerId).filter(Boolean))

        // Process only messages we haven't seen yet
        for (const gmailMessage of thread.data.messages) {
          const gmailMessageId = gmailMessage.id
          if (existingIds.has(gmailMessageId)) continue

          // Skip if this is an outbound message (we sent it)
          const messageData = await gmail.users.messages.get({
            userId: "me",
            id: gmailMessageId,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject"]
          })

          const headers = messageData.data.payload?.headers || []
          const from = headers.find((h: any) => h.name === "From")?.value || ""
          const to = headers.find((h: any) => h.name === "To")?.value || ""
          const account = await prisma.connectedEmailAccount.findUnique({ where: { id: accountId } })
          
          // If from address matches our account email, skip (it's our outbound message)
          if (from.includes(account?.email || "")) continue

          // Fetch full message to process
          const fullMessage = await gmail.users.messages.get({
            userId: "me",
            id: gmailMessageId,
            format: "raw"
          })

          if (!fullMessage.data.raw) continue

          // Parse and process the message
          const parsed = await simpleParser(Buffer.from(fullMessage.data.raw, "base64"))

          const getAddressText = (addr: any): string => {
            if (!addr) return ""
            if (typeof addr === 'string') return addr
            if (Array.isArray(addr)) return addr[0]?.text || addr[0]?.address || ""
            return addr.text || addr.address || ""
          }

          const inReplyToHeader = parsed.headers.get("in-reply-to") || parsed.headers.get("In-Reply-To") || ""
          const referencesHeader = parsed.headers.get("references") || parsed.headers.get("References") || ""
          
          const extractMessageId = (header: string): string | null => {
            if (!header) return null
            const match = header.match(/<([^>]+)>/)
            return match ? match[1] : null
          }
          const inReplyToMessageId = extractMessageId(inReplyToHeader)
          const gmailThreadId = fullMessage.data.threadId || null

          const emailData = {
            from: getAddressText(parsed.from),
            to: getAddressText(parsed.to),
            replyTo: parsed.replyTo ? getAddressText(parsed.replyTo) : undefined,
            subject: parsed.subject,
            body: parsed.text || "",
            htmlBody: parsed.html || undefined,
            providerId: gmailMessageId,
            providerData: {
              ...fullMessage.data,
              inReplyTo: inReplyToMessageId,
              references: referencesHeader,
              threadId: gmailThreadId
            },
            attachments: parsed.attachments?.map((att: any) => ({
              filename: att.filename || "attachment",
              content: att.content as Buffer,
              contentType: att.contentType || "application/octet-stream"
            }))
          }

          await EmailReceptionService.processInboundEmail(emailData)
          processed++
          console.log(`[Email Sync] Processed new message ${gmailMessageId} in thread ${threadId}`)
        }
      } catch (error: any) {
        console.error(`[Email Sync] Error processing thread ${threadId}:`, error)
        errors++
      }
    }

    return { processed, errors }
  }
}

