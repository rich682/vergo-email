import Imap from "imap"
import { simpleParser } from "mailparser"
import { EmailReceptionService, InboundEmailData } from "./email-reception.service"
import { prisma } from "@/lib/prisma"
import { EmailConnectionService } from "./email-connection.service"
import { decrypt } from "@/lib/encryption"

export class IMAPPollingService {
  static async pollAccount(accountId: string): Promise<void> {
    const account = await prisma.connectedEmailAccount.findUnique({
      where: { id: accountId }
    })

    if (!account || account.provider !== "GENERIC_SMTP") {
      return
    }

    if (!account.smtpHost || !account.smtpPort || !account.smtpUser) {
      return
    }

    const credentials = await EmailConnectionService.getDecryptedCredentials(accountId)
    if (!credentials?.smtpPassword) {
      return
    }

    // For IMAP, we typically use the same host but different port
    // This is a simplified implementation
    const imap = new Imap({
      user: account.smtpUser,
      password: credentials.smtpPassword,
      host: account.smtpHost,
      port: 993,
      tls: account.smtpSecure,
      tlsOptions: { rejectUnauthorized: false }
    })

    return new Promise((resolve, reject) => {
      imap.once("ready", () => {
        imap.openBox("INBOX", false, (err, box) => {
          if (err) {
            imap.end()
            return reject(err)
          }

          // Search for unread messages
          imap.search(["UNSEEN"], (err, results) => {
            if (err) {
              imap.end()
              return reject(err)
            }

            if (!results || results.length === 0) {
              imap.end()
              return resolve()
            }

            const fetch = imap.fetch(results, { bodies: "" })

            fetch.on("message", (msg, seqno) => {
              msg.on("body", (stream) => {
                simpleParser(stream, async (err, parsed) => {
                  if (err) {
                    console.error("Error parsing email:", err)
                    return
                  }

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
                  const emailData: InboundEmailData = {
                    from: parsed.from?.text || "",
                    to: parsed.to?.text || "",
                    replyTo: parsed.replyTo?.text,
                    subject: parsed.subject,
                    body: parsed.text || "",
                    htmlBody: parsed.html || undefined,
                    providerId: seqno.toString(),
                    providerData: {
                      messageId: parsed.messageId,
                      date: parsed.date
                    },
                    attachments: attachments.length > 0 ? attachments : undefined
                  }

                  try {
                    await EmailReceptionService.processInboundEmail(emailData)
                  } catch (error) {
                    console.error("Error processing inbound email:", error)
                  }
                })
              })
            })

            fetch.once("end", () => {
              imap.end()
              resolve()
            })
          })
        })
      })

      imap.once("error", (err) => {
        reject(err)
      })

      imap.connect()
    })
  }

  static async pollAllSMTPAccounts(): Promise<void> {
    const accounts = await prisma.connectedEmailAccount.findMany({
      where: {
        provider: "GENERIC_SMTP",
        isActive: true
      }
    })

    for (const account of accounts) {
      try {
        await this.pollAccount(account.id)
      } catch (error) {
        console.error(`Error polling account ${account.id}:`, error)
      }
    }
  }
}

