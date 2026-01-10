import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { EmailReceptionService, InboundEmailData } from "@/lib/services/email-reception.service"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { prisma } from "@/lib/prisma"
import { simpleParser } from "mailparser"
import { createHash } from "crypto"

export async function POST(request: NextRequest) {
  // Always return 200 OK to prevent Gmail from retrying
  try {
    const body = await request.json()

    // Gmail push notification format from Pub/Sub
    // { message: { data: base64EncodedMessageId, messageId: string, attributes?: { emailAddress?: string, historyId?: string } } }
    const historyId = body.message?.attributes?.historyId || null
    const emailAddress = body.message?.attributes?.emailAddress || null
    
    // Structured log for webhook receipt
    console.log(JSON.stringify({
      event: 'webhook_received',
      timestampMs: Date.now(),
      hasHistoryId: !!historyId,
      historyId: historyId || null,
      mailboxEmail: emailAddress ? emailAddress.substring(0, 3) + '***' : null, // Partial email for logging
      hasMessageData: !!body.message?.data
    }))

    if (body.message?.data) {
      const messageId = Buffer.from(body.message.data, "base64").toString()

      // Route to correct account: Try to identify account from emailAddress attribute first
      let accounts = []
      
      if (emailAddress) {
        // Try to find account by email address from Pub/Sub notification
        const accountByEmail = await prisma.connectedEmailAccount.findFirst({
          where: {
            provider: "GMAIL",
            isActive: true,
            email: emailAddress
          }
        })
        if (accountByEmail) {
          accounts = [accountByEmail]
        }
      }

      // If no account found by email, get all active Gmail accounts but stop on first success
      if (accounts.length === 0) {
        accounts = await prisma.connectedEmailAccount.findMany({
          where: {
            provider: "GMAIL",
            isActive: true
          }
        })
      }

      if (accounts.length === 0) {
        console.log(JSON.stringify({
          event: 'webhook_received',
          timestampMs: Date.now(),
          error: 'no_active_gmail_accounts'
        }))
        return NextResponse.json({ success: true, processed: false, reason: 'no_active_accounts' })
      }

      // Try each account until we successfully process the message
      let processed = false
      for (const account of accounts) {
        try {
          const oauth2Client = await EmailConnectionService.getGmailClient(account.id)
          if (!oauth2Client) {
            continue
          }

          const gmail = google.gmail({ version: "v1", auth: oauth2Client })

          // Fetch the message with full headers to get In-Reply-To and References
          // If this fails (e.g., message not found in this account), try next account
          let message
          try {
            message = await gmail.users.messages.get({
              userId: "me",
              id: messageId,
              format: "raw"
            })
          } catch (fetchError: any) {
            // Message not found in this account - try next account
            if (fetchError.code === 404) {
              continue
            }
            throw fetchError
          }

          if (!message.data.raw) {
            continue
          }

          // Parse the message
          const parsed = await simpleParser(
            Buffer.from(message.data.raw, "base64")
          )

          // Extract In-Reply-To and References headers for matching replies to original messages
          const inReplyToHeader = parsed.headers.get("in-reply-to") || parsed.headers.get("In-Reply-To") || ""
          const referencesHeader = parsed.headers.get("references") || parsed.headers.get("References") || ""
          
          // Clean up message IDs (remove < > brackets and extract ID)
          // Gmail message IDs are in format: <unique-id@mail.gmail.com> or similar
          const extractMessageId = (header: string): string | null => {
            if (!header) return null
            // Extract message ID from header (format: <message-id@domain>)
            const match = header.match(/<([^>]+)>/)
            return match ? match[1] : null
          }
          const inReplyToMessageId = extractMessageId(inReplyToHeader)
          
          // Also get Gmail thread ID from the message data
          const gmailThreadId = message.data.threadId || null

          // Structured log for inbound message fetch
          const accountHash = createHash('sha256').update(account.id).digest('hex').substring(0, 16)
          console.log(JSON.stringify({
            event: 'inbound_message_fetched',
            timestampMs: Date.now(),
            accountHash,
            threadId: gmailThreadId || null,
            messageIdHeader: inReplyToMessageId || null,
            hasInReplyTo: !!inReplyToMessageId
          }))

          // Extract attachments
          const attachments: Array<{
            filename: string
            content: Buffer
            contentType: string
          }> = []

          if (parsed.attachments) {
            for (const attachment of parsed.attachments) {
              attachments.push({
                filename: attachment.filename || "attachment",
                content: attachment.content as Buffer,
                contentType: attachment.contentType || "application/octet-stream"
              })
            }
          }

          // Process email
          const getAddressText = (addr: any): string => {
            if (!addr) return ""
            if (typeof addr === 'string') return addr
            if (Array.isArray(addr)) return addr[0]?.text || addr[0]?.address || ""
            return addr.text || addr.address || ""
          }
          
          const emailData: InboundEmailData = {
            from: getAddressText(parsed.from),
            to: getAddressText(parsed.to),
            replyTo: parsed.replyTo ? getAddressText(parsed.replyTo) : undefined,
            subject: parsed.subject,
            body: parsed.text || "",
            htmlBody: parsed.html || undefined,
            providerId: messageId,
            providerData: {
              ...message.data,
              inReplyTo: inReplyToMessageId,
              references: referencesHeader,
              threadId: gmailThreadId
            },
            attachments: attachments.length > 0 ? attachments : undefined
          }

          await EmailReceptionService.processInboundEmail(emailData)
          processed = true
          break // Successfully processed, stop trying other accounts
        } catch (error: any) {
          // Log error but continue to next account (or break if we've tried all)
          const accountHash = createHash('sha256').update(account.id).digest('hex').substring(0, 16)
          console.error(JSON.stringify({
            event: 'webhook_account_error',
            timestampMs: Date.now(),
            accountHash,
            error: error.message?.substring(0, 100),
            errorCode: error.code
          }))
          // Continue to next account unless it's a non-404 error that suggests account-level issue
          if (error.code !== 404 && error.code !== 'ENOTFOUND') {
            // For non-404 errors, log but continue trying other accounts
            continue
          }
        }
      }

      if (!processed) {
        console.log(JSON.stringify({
          event: 'webhook_received',
          timestampMs: Date.now(),
          error: 'could_not_process_from_any_account',
          messageId: messageId.substring(0, 20) + '...',
          accountsTried: accounts.length
        }))
      }

      return NextResponse.json({ success: true, processed })
    }

    // No message data in payload
    return NextResponse.json({ success: true, processed: false, reason: 'no_message_data' })
  } catch (error: any) {
    console.error(JSON.stringify({
      event: 'webhook_received',
      timestampMs: Date.now(),
      error: 'webhook_parse_error',
      errorMessage: error.message?.substring(0, 100)
    }))
    console.error("Error processing Gmail webhook:", error)
  }

  // Always return 200 OK to prevent retries
  return NextResponse.json({ success: true })
}

