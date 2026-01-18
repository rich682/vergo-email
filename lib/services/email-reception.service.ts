import { prisma } from "@/lib/prisma"
import { Task, TaskStatus, MessageDirection } from "@prisma/client"
import { ThreadIdExtractor } from "./thread-id-extractor"
import { getStorageService } from "./storage.service"
import { inngest } from "@/inngest/client"
import { createHash } from "crypto"
import { ReminderStateService } from "./reminder-state.service"
import { CollectionService } from "./collection.service"
import { AttachmentService } from "./attachment.service"

export interface InboundEmailData {
  from: string
  to: string
  replyTo?: string
  subject?: string
  body?: string
  htmlBody?: string
  providerId: string
  providerData: any // Can contain inReplyTo, references, threadId for Gmail matching
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

export class EmailReceptionService {
  /**
   * Extract name from email address if present
   * e.g., "John Doe <john@example.com>" -> "John Doe"
   */
  private static extractNameFromEmail(email: string): string | undefined {
    // Try to extract name from "Name <email>" format
    const match = email.match(/^([^<]+)\s*<[^>]+>$/)
    if (match && match[1]) {
      return match[1].trim()
    }
    return undefined
  }

  /**
   * Detect if an email is an auto-reply (OOO, bounce, delivery notification, etc.)
   * These should be flagged so they can be filtered out in the UI
   */
  static isAutoReply(data: InboundEmailData): boolean {
    const fromLower = data.from.toLowerCase()
    const subjectLower = (data.subject || "").toLowerCase()
    
    // Check sender patterns for bounces/system messages
    const autoReplySenders = [
      "mailer-daemon@",
      "postmaster@",
      "noreply@",
      "no-reply@",
      "donotreply@",
      "do-not-reply@",
      "auto-reply@",
      "autoreply@",
      "mailerdaemon@",
      "mail-daemon@",
      "daemon@",
      "bounce@",
      "bounces@",
      "notifications@",
    ]
    
    for (const sender of autoReplySenders) {
      if (fromLower.includes(sender)) {
        return true
      }
    }
    
    // Check subject patterns
    const autoReplySubjects = [
      "out of office",
      "out-of-office",
      "automatic reply",
      "auto-reply",
      "auto reply",
      "autoreply",
      "undeliverable",
      "undelivered",
      "delivery status",
      "delivery failure",
      "delivery notification",
      "mail delivery failed",
      "mail delivery subsystem",
      "returned mail",
      "failure notice",
      "vacation reply",
      "vacation response",
      "i am out of the office",
      "i'm out of the office",
      "away from the office",
      "currently out of office",
      "on vacation",
      "on leave",
      "on holiday",
      "will be back",
      "will return",
      "limited access to email",
      "delayed response",
      "automatic response",
      "this is an automated",
      "do not reply to this email",
    ]
    
    for (const pattern of autoReplySubjects) {
      if (subjectLower.includes(pattern)) {
        return true
      }
    }
    
    // Check body for common auto-reply patterns (first 500 chars)
    const bodyLower = (data.body || "").toLowerCase().substring(0, 500)
    const autoReplyBodyPatterns = [
      "this is an automated message",
      "this is an automatic response",
      "this is an auto-generated",
      "this email was sent automatically",
      "i am currently out of the office",
      "i'm currently out of the office",
      "i will be out of the office",
      "thank you for your email. i am currently",
      "your message was not delivered",
      "the following message could not be delivered",
      "delivery has failed",
      "message delivery failed",
      "undeliverable message",
    ]
    
    for (const pattern of autoReplyBodyPatterns) {
      if (bodyLower.includes(pattern)) {
        return true
      }
    }
    
    // Check provider data for auto-submitted header
    if (data.providerData?.headers) {
      const headers = data.providerData.headers
      // Check for Auto-Submitted header (RFC 3834)
      if (headers["auto-submitted"] && headers["auto-submitted"] !== "no") {
        return true
      }
      // Check for X-Auto-Response-Suppress header
      if (headers["x-auto-response-suppress"]) {
        return true
      }
      // Check for Precedence: bulk/junk/list
      const precedence = headers["precedence"]?.toLowerCase()
      if (precedence === "bulk" || precedence === "junk" || precedence === "auto_reply") {
        return true
      }
    }
    
    return false
  }

  static async processInboundEmail(
    data: InboundEmailData
  ): Promise<{ taskId: string | null; messageId: string }> {
    // Log incoming email for debugging
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

    // Try to match reply to original message using multiple strategies:
    // 1. Gmail In-Reply-To header (most reliable - contains original message ID)
    // 2. Gmail thread ID from providerData
    // 3. Legacy: Extract thread ID from reply-to address (for backwards compatibility)
    
    let task = null
    
    // Strategy 1: Match by In-Reply-To header (Message-ID header from original email) - EFFICIENT INDEXED QUERY
    const inReplyToMessageId = data.providerData?.inReplyTo
    if (inReplyToMessageId) {
      // Normalize the Message-ID (remove < > brackets if present)
      const normalizedInReplyTo = inReplyToMessageId.replace(/^<|>$/g, "").trim()
      
      // Query directly using indexed messageIdHeader column (efficient)
      // Try exact match first, then try with brackets
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
          task: {
            include: { entity: true }
          }
        }
      })
      
      if (originalMessage?.task) {
        task = originalMessage.task
        const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
        console.log(JSON.stringify({
          event: 'reply_linked',
          requestId: task.id,
          recipientHash,
          timestampMs: Date.now(),
          method: 'in_reply_to_header',
          messageIdHeader: normalizedInReplyTo
        }))
        console.log(`Matched reply to original message by In-Reply-To Message-ID: ${normalizedInReplyTo} -> Task ${task.id}`)
      }
    }
    
    // Strategy 2: Match by thread ID (Gmail threadId or Microsoft conversationId)
    const threadIdToMatch = data.providerData?.threadId || data.providerData?.conversationId
    if (!task && threadIdToMatch) {
      const threadId = String(threadIdToMatch)
      
      // Query directly using indexed threadId column (efficient)
      const matchingMessage = await prisma.message.findFirst({
        where: {
          direction: "OUTBOUND",
          threadId: threadId
        },
        include: {
          task: {
            include: { entity: true }
          }
        }
      })
      
      if (matchingMessage?.task) {
        task = matchingMessage.task
        const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
        console.log(JSON.stringify({
          event: 'reply_linked',
          requestId: task.id,
          recipientHash,
          timestampMs: Date.now(),
          method: 'thread_id',
          threadId: threadId
        }))
        console.log(`[Email Reception] Matched reply by thread ID: ${threadId} -> Task ${task.id}`)
      } else {
        console.log(`[EmailReception] No match found for threadId: ${threadId}`)
      }
    }
    
    // Strategy 2b: Fallback - Try matching by subject pattern (only if both above failed)
    if (!task && data.subject) {
      const subjectWithoutRe = data.subject.replace(/^(Re:|RE:|re:)\s*/i, "").trim()
      if (subjectWithoutRe && subjectWithoutRe.length > 5) {
        // Only use subject matching if subject is meaningful (more than 5 chars)
        const matchingTask = await prisma.task.findFirst({
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
          take: 1 // Limit to 1 result
        })
        
        if (matchingTask) {
          task = matchingTask
          const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
          console.log(JSON.stringify({
            event: 'reply_linked',
            requestId: task.id,
            recipientHash,
            timestampMs: Date.now(),
            method: 'subject_pattern',
            subjectPattern: subjectWithoutRe.substring(0, 50)
          }))
          console.log(`[Email Reception] Matched reply by subject pattern: "${subjectWithoutRe.substring(0, 50)}" -> Task ${task.id}`)
        }
      }
    }
    
    // Strategy 3: Legacy - Extract thread ID from reply-to address (for backwards compatibility)
    if (!task) {
      const threadId = ThreadIdExtractor.extractFromEmailAddress(
        data.replyTo || data.to
      )
      
      if (threadId) {
        task = await prisma.task.findUnique({
          where: { threadId },
          include: { entity: true }
        })
        
        if (task) {
          console.log(`Matched reply by legacy thread ID: ${threadId} -> Task ${task.id}`)
        }
      }
    }

    if (!task) {
      // Orphaned message - couldn't match to any task
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
        },
        inReplyToValue: data.providerData?.inReplyTo ? data.providerData.inReplyTo.substring(0, 50) : null,
        threadIdValue: data.providerData?.threadId || null
      }))
      console.warn("[Email Reception] Orphaned email received - could not match to task:", {
        providerId: data.providerId,
        from: data.from,
        subject: data.subject?.substring(0, 50),
        inReplyTo: data.providerData?.inReplyTo,
        gmailThreadId: data.providerData?.threadId,
        replyTo: data.replyTo,
        to: data.to
      })
      return {
        taskId: null,
        messageId: ""
      }
    }
    
    const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
    console.log(`[Email Reception] Successfully matched reply from ${data.from} to Task ${task.id} (Campaign: ${task.campaignName || 'N/A'})`)

    // Process attachments
    let hasAttachments = false
    const attachmentKeys: string[] = []
    const attachmentData: Array<{ key: string; url: string; filename: string; content: Buffer; contentType: string }> = []

    if (data.attachments && data.attachments.length > 0) {
      hasAttachments = true
      const storage = getStorageService()

      for (const attachment of data.attachments) {
        const key = `tasks/${task.id}/${Date.now()}-${attachment.filename}`
        // Capture the URL directly from the upload response!
        const { url } = await storage.upload(
          attachment.content,
          key,
          attachment.contentType
        )
        attachmentKeys.push(key)
        attachmentData.push({
          key,
          url, // Store the URL from the upload response
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType
        })
      }
    }

    // Check if this is an auto-reply (OOO, bounce, etc.) - check before updating status
    const isAutoReply = this.isAutoReply(data)
    if (isAutoReply) {
      console.log(`[Email Reception] Detected auto-reply from ${data.from}: "${data.subject?.substring(0, 50)}"`)
    }

    // Determine if we should auto-update status to REPLIED
    // Only update if: not an auto-reply AND current status is not already COMPLETE
    const shouldUpdateStatus = !isAutoReply && task.status !== "COMPLETE" && task.status !== "FULFILLED"

    // Update task - auto-change status to REPLIED when a real reply is received
    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        hasAttachments: hasAttachments || task.hasAttachments,
        documentKey: attachmentKeys.length > 0
          ? attachmentKeys[0]
          : task.documentKey,
        // Update readStatus to indicate a reply was received
        readStatus: "replied",
        // Auto-update status to REPLIED when receiving a real reply (not auto-reply)
        ...(shouldUpdateStatus && { status: "REPLIED" })
      }
    })

    // Create message record
    const message = await prisma.message.create({
      data: {
        taskId: task.id,
        entityId: task.entityId,
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

    // Create CollectedItem records AND Attachment records for attachments if task has a jobId
    // This enables both the Collection feature and the Task Attachments panel
    // Skip auto-replies to avoid polluting with bounce/OOO attachments
    if (hasAttachments && task.jobId && attachmentData.length > 0 && !isAutoReply) {
      const submitterName = this.extractNameFromEmail(data.from)
      
      for (let i = 0; i < attachmentData.length; i++) {
        const att = attachmentData[i]
        try {
          // Create CollectedItem for the Collection tab
          await CollectionService.createFromEmailAttachment({
            organizationId: task.organizationId,
            jobId: task.jobId,
            taskId: task.id,
            messageId: message.id,
            filename: att.filename,
            fileKey: att.key,
            fileUrl: att.url, // Pass the URL directly from upload!
            fileSize: att.content.length,
            mimeType: att.contentType,
            submittedBy: data.from,
            submittedByName: submitterName,
            receivedAt: new Date()
          })
          console.log(`[Collection] Created CollectedItem for attachment: ${att.filename} (Task: ${task.id}, Job: ${task.jobId})`)

          // Also create Attachment record for the Task Attachments panel
          await AttachmentService.createFromInboundEmail({
            organizationId: task.organizationId,
            jobId: task.jobId,
            file: att.content,
            filename: att.filename,
            mimeType: att.contentType,
            fileKey: att.key
          })
          console.log(`[Attachment] Created Attachment for: ${att.filename} (Job: ${task.jobId})`)
        } catch (error) {
          console.error(`[Email Reception] Error creating records for attachment ${att.filename}:`, error)
          // Don't fail the entire email processing if collection/attachment creation fails
        }
      }
    } else if (hasAttachments && isAutoReply) {
      console.log(`[Collection] Skipping CollectedItem/Attachment creation for auto-reply attachments from ${data.from}`)
    }

    // Trigger AI processing
    await inngest.send({
      name: "message/classify",
      data: {
        messageId: message.id,
        taskId: task.id
      }
    })

    if (hasAttachments) {
      await inngest.send({
        name: "document/verify",
        data: {
          taskId: task.id,
          messageId: message.id,
          attachmentKeys
        }
      })
    }

    // Trigger task summary generation
    await inngest.send({
      name: "task/summarize",
      data: {
        taskId: task.id,
        messageId: message.id
      }
    })

    // Structured log for reply ingestion
    // Note: RAG computation happens asynchronously via Inngest classify-message function, so riskLevel/readStatus may be null here
    // The RAG computation will log separately via rag_computed event
    const recipientHashForLog = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
    console.log(JSON.stringify({
      event: 'reply_ingested',
      requestId: task.id,
      recipientHash: recipientHashForLog,
      timestampMs: Date.now(),
      riskRecomputeInvoked: true, // Risk recompute triggered via Inngest message/classify event
      result: {
        riskLevel: task.riskLevel || null,
        readStatus: task.readStatus || null
      }
    }))

    // NOTE: Reminders are stopped in the Inngest classify-message function AFTER classification
    // This ensures bounces and out-of-office replies don't stop reminders
    // See: inngest/functions/index.ts -> classify-message -> ReminderStateService.stopForReplyIfNotBounce

    return {
      taskId: task.id,
      messageId: message.id
    }
  }
}

