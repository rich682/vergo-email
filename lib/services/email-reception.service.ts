import { prisma } from "@/lib/prisma"
import { Request, TaskStatus, MessageDirection } from "@prisma/client"
import { ThreadIdExtractor } from "./thread-id-extractor"
import { getStorageService } from "./storage.service"
import { inngest } from "@/inngest/client"
import { createHash } from "crypto"
import { ReminderStateService } from "./reminder-state.service"
import { EvidenceService } from "./evidence.service"
import { AttachmentService } from "./attachment.service"

export interface InboundEmailData {
  from: string
  to: string
  replyTo?: string
  subject?: string
  body?: string
  htmlBody?: string
  providerId: string
  providerData: any 
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

export class EmailReceptionService {
  private static extractNameFromEmail(email: string): string | undefined {
    const match = email.match(/^([^<]+)\s*<[^>]+>$/)
    if (match && match[1]) {
      return match[1].trim()
    }
    return undefined
  }

  /**
   * Detect bounce/delivery failure notifications
   * These are more specific than general auto-replies and indicate the email was not delivered
   */
  static isBounceNotification(data: InboundEmailData): boolean {
    const fromLower = data.from.toLowerCase()
    const subjectLower = (data.subject || "").toLowerCase()
    const bodyLower = (data.body || "").toLowerCase().substring(0, 2000)

    // Bounce-specific senders
    const bounceSenders = [
      "mailer-daemon@", "postmaster@", "mail-daemon@", "daemon@", "bounce@", "bounces@",
    ]
    const fromIsBounce = bounceSenders.some(s => fromLower.includes(s))

    // Bounce-specific subjects
    const bounceSubjects = [
      "undeliverable", "undelivered", "delivery status notification",
      "delivery failure", "mail delivery failed", "returned mail",
      "failure notice", "message not delivered", "delivery problem",
      "delivery has failed", "could not be delivered", "was not delivered",
    ]
    const subjectIsBounce = bounceSubjects.some(s => subjectLower.includes(s))

    // Bounce-specific body content
    const bounceBodyPatterns = [
      "your message was not delivered", "the following message could not be delivered",
      "delivery has failed", "message delivery failed", "undeliverable message",
      "550 ", "553 ", "554 ", "mailbox not found", "mailbox unavailable",
      "address rejected", "user unknown", "no such user",
      "message was blocked", "message has been blocked",
    ]
    const bodyIsBounce = bounceBodyPatterns.some(p => bodyLower.includes(p))

    // If sender is a bounce daemon AND (subject or body matches), it's a bounce
    if (fromIsBounce && (subjectIsBounce || bodyIsBounce)) return true
    // Even without bounce sender, clear delivery failure subjects + body
    if (subjectIsBounce && bodyIsBounce) return true

    return false
  }

  static isAutoReply(data: InboundEmailData): boolean {
    const fromLower = data.from.toLowerCase()
    const subjectLower = (data.subject || "").toLowerCase()
    
    const autoReplySenders = [
      "mailer-daemon@", "postmaster@", "noreply@", "no-reply@", "donotreply@", "do-not-reply@",
      "auto-reply@", "autoreply@", "mailerdaemon@", "mail-daemon@", "daemon@", "bounce@",
      "bounces@", "notifications@",
    ]
    
    for (const sender of autoReplySenders) {
      if (fromLower.includes(sender)) return true
    }
    
    const autoReplySubjects = [
      "out of office", "out-of-office", "automatic reply", "auto-reply", "auto reply", "autoreply",
      "undeliverable", "undelivered", "delivery status", "delivery failure", "delivery notification",
      "mail delivery failed", "mail delivery subsystem", "returned mail", "failure notice", "vacation reply",
      "vacation response", "i am out of the office", "i'm out of the office", "away from the office",
      "currently out of office", "on vacation", "on leave", "on holiday", "will be back", "will return",
      "limited access to email", "delayed response", "automatic response", "this is an automated",
      "do not reply to this email",
    ]
    
    for (const pattern of autoReplySubjects) {
      if (subjectLower.includes(pattern)) return true
    }
    
    const bodyLower = (data.body || "").toLowerCase().substring(0, 500)
    const autoReplyBodyPatterns = [
      "this is an automated message", "this is an automatic response", "this is an auto-generated",
      "this email was sent automatically", "i am currently out of the office", "i'm currently out of the office",
      "i will be out of the office", "thank you for your email. i am currently", "your message was not delivered",
      "the following message could not be delivered", "delivery has failed", "message delivery failed",
      "undeliverable message",
    ]
    
    for (const pattern of autoReplyBodyPatterns) {
      if (bodyLower.includes(pattern)) return true
    }
    
    if (data.providerData?.headers) {
      const headers = data.providerData.headers
      if (headers["auto-submitted"] && headers["auto-submitted"] !== "no") return true
      if (headers["x-auto-response-suppress"]) return true
      const precedence = headers["precedence"]?.toLowerCase()
      if (precedence === "bulk" || precedence === "junk" || precedence === "auto_reply") return true
    }
    
    return false
  }

  static async processInboundEmail(
    data: InboundEmailData
  ): Promise<{ requestId: string | null; messageId: string }> {
    console.log(`[EmailReception] Processing inbound email:`, {
      from: data.from,
      to: data.to,
      subject: data.subject?.substring(0, 50),
      hasAttachments: !!data.attachments?.length,
      inReplyTo: data.providerData?.inReplyTo || 'N/A',
      threadId: data.providerData?.threadId || 'N/A',
      conversationId: data.providerData?.conversationId || 'N/A',
      provider: data.providerData?.provider || 'unknown'
    })

    let request = null
    
    const inReplyToMessageId = data.providerData?.inReplyTo
    if (inReplyToMessageId) {
      const normalizedInReplyTo = inReplyToMessageId.replace(/^<|>$/g, "").trim()
      
      const originalMessage = await prisma.message.findFirst({
        where: {
          direction: "OUTBOUND",
          OR: [
            { messageIdHeader: normalizedInReplyTo },
            { messageIdHeader: `<${normalizedInReplyTo}>` },
            { messageIdHeader: inReplyToMessageId }
          ]
        },
        include: {
          request: {
            include: { entity: true }
          }
        }
      })
      
      if (originalMessage?.request) {
        request = originalMessage.request
        const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
        console.log(JSON.stringify({
          event: 'reply_linked',
          requestId: request.id,
          recipientHash,
          timestampMs: Date.now(),
          method: 'in_reply_to_header',
          messageIdHeader: normalizedInReplyTo
        }))
        console.log(`Matched reply to original message by In-Reply-To Message-ID: ${normalizedInReplyTo} -> Request ${request.id}`)
      }
    }
    
    const threadIdToMatch = data.providerData?.threadId || data.providerData?.conversationId
    if (!request && threadIdToMatch) {
      const threadId = String(threadIdToMatch)
      
      const matchingMessage = await prisma.message.findFirst({
        where: {
          direction: "OUTBOUND",
          threadId: threadId
        },
        include: {
          request: {
            include: { entity: true }
          }
        }
      })
      
      if (matchingMessage?.request) {
        request = matchingMessage.request
        const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
        console.log(JSON.stringify({
          event: 'reply_linked',
          requestId: request.id,
          recipientHash,
          timestampMs: Date.now(),
          method: 'thread_id',
          threadId: threadId
        }))
        console.log(`[Email Reception] Matched reply by thread ID: ${threadId} -> Request ${request.id}`)
      }
    }
    
    if (!request && data.subject) {
      const subjectWithoutRe = data.subject.replace(/^(Re:|RE:|re:)\s*/i, "").trim()
      if (subjectWithoutRe && subjectWithoutRe.length > 5) {
        const matchingRequest = await prisma.request.findFirst({
          where: {
            messages: {
              some: {
                direction: "OUTBOUND",
                subject: {
                  contains: subjectWithoutRe,
                  mode: "insensitive"
                }
              }
            }
          },
          include: { entity: true },
          take: 1
        })
        
        if (matchingRequest) {
          request = matchingRequest
          const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
          console.log(JSON.stringify({
            event: 'reply_linked',
            requestId: request.id,
            recipientHash,
            timestampMs: Date.now(),
            method: 'subject_pattern',
            subjectPattern: subjectWithoutRe.substring(0, 50)
          }))
          console.log(`[Email Reception] Matched reply by subject pattern: "${subjectWithoutRe.substring(0, 50)}" -> Request ${request.id}`)
        }
      }
    }
    
    if (!request) {
      const threadId = ThreadIdExtractor.extractFromEmailAddress(
        data.replyTo || data.to
      )
      
      if (threadId) {
        request = await prisma.request.findUnique({
          where: { threadId },
          include: { entity: true }
        })
        
        if (request) {
          console.log(`Matched reply by legacy thread ID: ${threadId} -> Request ${request.id}`)
        }
      }
    }

    if (!request) {
      const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
      console.log(JSON.stringify({
        event: 'reply_link_failed',
        recipientHash,
        timestampMs: Date.now(),
        reason: 'no_matching_outbound_message',
        identifiers_present: {
          inReplyTo: !!data.providerData?.inReplyTo,
          threadId: !!data.providerData?.threadId,
          subject: !!data.subject,
          providerId: !!data.providerId
        }
      }))
      console.warn("[Email Reception] Orphaned email received - could not match to request:", {
        providerId: data.providerId,
        from: data.from,
        subject: data.subject?.substring(0, 50),
        inReplyTo: data.providerData?.inReplyTo,
        gmailThreadId: data.providerData?.threadId,
        replyTo: data.replyTo,
        to: data.to
      })
      return {
        requestId: null,
        messageId: ""
      }
    }
    
    const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
    console.log(`[Email Reception] Successfully matched reply from ${data.from} to Request ${request.id} (Campaign: ${request.campaignName || 'N/A'})`)

    let hasAttachments = false
    const attachmentKeys: string[] = []
    const attachmentData: Array<{ key: string; url: string; filename: string; content: Buffer; contentType: string }> = []

    if (data.attachments && data.attachments.length > 0) {
      hasAttachments = true
      const storage = getStorageService()

      for (const attachment of data.attachments) {
        const key = `requests/${request.id}/${Date.now()}-${attachment.filename}`
        const { url } = await storage.upload(
          attachment.content,
          key,
          attachment.contentType
        )
        attachmentKeys.push(key)
        attachmentData.push({
          key,
          url,
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType
        })
      }
    }

    const isAutoReply = this.isAutoReply(data)
    const isBounce = this.isBounceNotification(data)
    if (isAutoReply) {
      console.log(`[Email Reception] Detected auto-reply from ${data.from}: "${data.subject?.substring(0, 50)}"`)
    }
    if (isBounce) {
      console.log(`[Email Reception] Detected BOUNCE from ${data.from}: "${data.subject?.substring(0, 80)}"`)
    }

    // Determine status update:
    // - Bounce → SEND_FAILED (delivery failed permanently)
    // - Auto-reply (not bounce) → don't change status
    // - Real reply → REPLIED
    let newStatus: string | undefined
    if (isBounce && request.status !== "COMPLETE" && request.status !== "FULFILLED") {
      newStatus = "SEND_FAILED"
    } else if (!isAutoReply && !isBounce && request.status !== "COMPLETE" && request.status !== "FULFILLED") {
      newStatus = "REPLIED"
    }

    // Update request status + create message atomically
    const { updatedRequest, message } = await prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.request.update({
        where: { id: request.id },
        data: {
          hasAttachments: hasAttachments || request.hasAttachments,
          documentKey: attachmentKeys.length > 0
            ? attachmentKeys[0]
            : request.documentKey,
          readStatus: isBounce ? "bounced" : "replied",
          ...(newStatus && { status: newStatus as any }),
          // Store bounce details in aiReasoning for visibility
          ...(isBounce && {
            aiReasoning: {
              bounceDetected: true,
              bounceFrom: data.from,
              bounceSubject: data.subject?.substring(0, 200),
              bounceAt: new Date().toISOString(),
            }
          })
        }
      })

      const message = await tx.message.create({
        data: {
          requestId: request.id,
          entityId: request.entityId,
          direction: "INBOUND",
          channel: "EMAIL",
          subject: data.subject,
          body: data.body,
          htmlBody: data.htmlBody,
          fromAddress: data.from,
          toAddress: data.to,
          providerId: data.providerId,
          providerData: data.providerData,
          isAutoReply,
          attachments: attachmentKeys.length > 0
            ? ({ keys: attachmentKeys } as any)
            : undefined
        }
      })

      return { updatedRequest, message }
    })

    if (hasAttachments && request.taskInstanceId && attachmentData.length > 0 && !isAutoReply) {
      const submitterName = this.extractNameFromEmail(data.from)
      
      for (let i = 0; i < attachmentData.length; i++) {
        const att = attachmentData[i]
        try {
          await EvidenceService.createFromEmailAttachment({
            organizationId: request.organizationId,
            taskInstanceId: request.taskInstanceId,
            requestId: request.id,
            messageId: message.id,
            filename: att.filename,
            fileKey: att.key,
            fileUrl: att.url,
            fileSize: att.content.length,
            mimeType: att.contentType,
            submittedBy: data.from,
            submittedByName: submitterName,
            receivedAt: new Date()
          })
          console.log(`[Evidence] Created CollectedItem for attachment: ${att.filename} (Request: ${request.id}, Task: ${request.taskInstanceId})`)

          await AttachmentService.createFromInboundEmail({
            organizationId: request.organizationId,
            taskInstanceId: request.taskInstanceId,
            file: att.content,
            filename: att.filename,
            mimeType: att.contentType,
            fileKey: att.key
          })
          console.log(`[Attachment] Created Attachment for: ${att.filename} (Task: ${request.taskInstanceId})`)
        } catch (error) {
          console.error(`[Email Reception] Error creating records for attachment ${att.filename}:`, error)
        }
      }
    }

    await inngest.send({
      name: "message/classify",
      data: {
        messageId: message.id,
        requestId: request.id
      }
    })

    if (hasAttachments) {
      await inngest.send({
        name: "document/verify",
        data: {
          requestId: request.id,
          messageId: message.id,
          attachmentKeys
        }
      })
    }

    await inngest.send({
      name: "request/summarize",
      data: {
        requestId: request.id,
        messageId: message.id
      }
    })

    const recipientHashForLog = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
    console.log(JSON.stringify({
      event: 'reply_ingested',
      requestId: request.id,
      recipientHash: recipientHashForLog,
      timestampMs: Date.now(),
      riskRecomputeInvoked: true,
      result: {
        riskLevel: request.riskLevel || null,
        readStatus: request.readStatus || null
      }
    }))

    return {
      requestId: request.id,
      messageId: message.id
    }
  }
}
