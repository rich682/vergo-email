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
    
    // Strategy 1: Match by In-Reply-To header (Message-ID header from original email)
    const inReplyToMessageId = data.providerData?.inReplyTo
    if (inReplyToMessageId) {
      // The In-Reply-To header contains the Message-ID header from the original email
      // We need to search providerData for messages that have this Message-ID stored
      // Since providerData is JSON, we need to query messages and check their providerData
      const allOutboundMessages = await prisma.message.findMany({
        where: {
          direction: "OUTBOUND",
          providerData: { not: null }
        },
        include: {
          task: {
            include: { entity: true }
          }
        }
      })
      
      // Find message where providerData.messageIdHeader matches inReplyToMessageId
      const originalMessage = allOutboundMessages.find(msg => {
        const providerData = msg.providerData as any
        const messageIdHeader = providerData?.messageIdHeader || ""
        // Compare without < > brackets (In-Reply-To may or may not have them)
        const normalizedInReplyTo = inReplyToMessageId.replace(/^<|>$/g, "")
        const normalizedHeader = messageIdHeader.replace(/^<|>$/g, "")
        return normalizedInReplyTo === normalizedHeader || messageIdHeader === inReplyToMessageId || messageIdHeader === `<${inReplyToMessageId}>`
      })
      
      if (originalMessage?.task) {
        task = originalMessage.task
        console.log(`Matched reply to original message by In-Reply-To Message-ID: ${inReplyToMessageId} -> Task ${task.id}`)
      }
    }
    
    // Strategy 2: Match by Gmail thread ID (more reliable than subject matching)
    if (!task && data.providerData?.threadId) {
      // Gmail thread ID is stored in providerData.threadId when we send emails
      // Find any outbound message with matching Gmail thread ID
      const gmailThreadId = data.providerData.threadId
      
      // Query messages where providerData contains the threadId
      // Note: Prisma JSON queries need special handling
      const matchingMessages = await prisma.message.findMany({
        where: {
          direction: "OUTBOUND",
          providerData: { not: null }
        },
        include: {
          task: {
            include: { entity: true }
          }
        }
      })
      
      // Filter in memory for matching thread ID (Prisma JSON path queries can be tricky)
      const matchingMessage = matchingMessages.find(msg => {
        const providerData = msg.providerData as any
        return providerData?.threadId === gmailThreadId
      })
      
      if (matchingMessage?.task) {
        task = matchingMessage.task
        console.log(`[Email Reception] Matched reply by Gmail thread ID: ${gmailThreadId} -> Task ${task.id}`)
      } else {
        // Fallback: Try matching by subject pattern if thread ID didn't work
        const subjectWithoutRe = data.subject?.replace(/^(Re:|RE:|re:)\s*/i, "").trim()
        if (subjectWithoutRe) {
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
            include: { entity: true }
          })
          
          if (matchingTask) {
            task = matchingTask
            console.log(`[Email Reception] Matched reply by subject pattern: "${subjectWithoutRe}" -> Task ${task.id}`)
          }
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
      console.warn("[Email Reception] Orphaned email received - could not match to task:", {
        providerId: data.providerId,
        from: data.from,
        subject: data.subject,
        inReplyTo: data.providerData?.inReplyTo,
        gmailThreadId: data.providerData?.threadId,
        replyTo: data.replyTo,
        to: data.to,
        messageIdHeader: data.providerData?.messageIdHeader
      })
      return {
        taskId: null,
        messageId: ""
      }
    }
    
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
    // Note: RAG computation happens asynchronously via Inngest, so riskLevel/readStatus may be null here
    // The RAG computation will log separately via rag_computed event
    const recipientHash = createHash('sha256').update(data.from.toLowerCase().trim()).digest('hex').substring(0, 16)
    console.log(JSON.stringify({
      event: 'reply_ingested',
      requestId: task.id,
      recipientHash,
      timestampMs: new Date().getTime(),
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

