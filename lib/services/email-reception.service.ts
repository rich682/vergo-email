import { prisma } from "@/lib/prisma"
import { Task, TaskStatus, MessageDirection } from "@prisma/client"
import { ThreadIdExtractor } from "./thread-id-extractor"
import { getStorageService } from "./storage.service"
import { inngest } from "@/inngest/client"
import { createHash } from "crypto"

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
  static async processInboundEmail(
    data: InboundEmailData
  ): Promise<{ taskId: string | null; messageId: string }> {
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
    
    // Strategy 2: Match by Gmail thread ID (efficient indexed query)
    if (!task && data.providerData?.threadId) {
      const gmailThreadId = String(data.providerData.threadId)
      
      // Query directly using indexed threadId column (efficient)
      const matchingMessage = await prisma.message.findFirst({
        where: {
          direction: "OUTBOUND",
          threadId: gmailThreadId
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
          threadId: gmailThreadId
        }))
        console.log(`[Email Reception] Matched reply by Gmail thread ID: ${gmailThreadId} -> Task ${task.id}`)
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

    if (data.attachments && data.attachments.length > 0) {
      hasAttachments = true
      const storage = getStorageService()

      for (const attachment of data.attachments) {
        const key = `tasks/${task.id}/${Date.now()}-${attachment.filename}`
        await storage.upload(
          attachment.content,
          key,
          attachment.contentType
        )
        attachmentKeys.push(key)
      }
    }

    // Determine task status
    let newStatus: TaskStatus = task.status
    if (hasAttachments) {
      newStatus = "HAS_ATTACHMENTS"
    } else if (task.status === "AWAITING_RESPONSE") {
      newStatus = "REPLIED"
    }

    // Update task
    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: newStatus,
        hasAttachments: hasAttachments || task.hasAttachments,
        documentKey: attachmentKeys.length > 0
          ? attachmentKeys[0]
          : task.documentKey
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
        attachments: attachmentKeys.length > 0
          ? ({ keys: attachmentKeys } as any)
          : undefined
      }
    })

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

    return {
      taskId: task.id,
      messageId: message.id
    }
  }
}

