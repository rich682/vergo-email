import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { EmailReceptionService, InboundEmailData } from "@/lib/services/email-reception.service"
import { EmailConnectionService } from "@/lib/services/email-connection.service"
import { prisma } from "@/lib/prisma"
import { simpleParser } from "mailparser"

export async function POST(request: NextRequest) {
  // Always return 200 OK to prevent Gmail from retrying
  try {
    const body = await request.json()

    // Gmail push notification format
    // { message: { data: base64EncodedMessageId, messageId: string } }
    if (body.message?.data) {
      const messageId = Buffer.from(body.message.data, "base64").toString()

      // Find all Gmail accounts and process
      // In production, you'd want to determine which account this is for
      const accounts = await prisma.connectedEmailAccount.findMany({
        where: {
          provider: "GMAIL",
          isActive: true
        }
      })

      for (const account of accounts) {
        try {
          const oauth2Client = await EmailConnectionService.getGmailClient(account.id)
          if (!oauth2Client) continue

          const gmail = google.gmail({ version: "v1", auth: oauth2Client })

          // Fetch the message
          const message = await gmail.users.messages.get({
            userId: "me",
            id: messageId,
            format: "raw"
          })

          if (!message.data.raw) continue

          // Parse the message
          const parsed = await simpleParser(
            Buffer.from(message.data.raw, "base64")
          )

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
            providerData: message.data,
            attachments: attachments.length > 0 ? attachments : undefined
          }

          await EmailReceptionService.processInboundEmail(emailData)
        } catch (error) {
          console.error(`Error processing Gmail message for account ${account.id}:`, error)
        }
      }
    }
  } catch (error) {
    console.error("Error processing Gmail webhook:", error)
  }

  // Always return 200 OK
  return NextResponse.json({ success: true })
}

