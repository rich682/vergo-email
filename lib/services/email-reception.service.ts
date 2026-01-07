import { prisma } from "@/lib/prisma"
import { Task, TaskStatus, MessageDirection } from "@prisma/client"
import { ThreadIdExtractor } from "./thread-id-extractor"
import { getStorageService } from "./storage.service"
import { inngest } from "@/inngest/client"

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
  static async processInboundEmail(
    data: InboundEmailData
  ): Promise<{ taskId: string | null; messageId: string }> {
    // Extract thread ID from reply-to or to address
    const threadId = ThreadIdExtractor.extractFromEmailAddress(
      data.replyTo || data.to
    )

    if (!threadId) {
      // Orphaned message - log but don't create task
      console.warn("Orphaned email received:", data.providerId)
      return {
        taskId: null,
        messageId: ""
      }
    }

    // Find task by thread ID
    const task = await prisma.task.findUnique({
      where: { threadId },
      include: { entity: true }
    })

    if (!task) {
      console.warn("Task not found for threadId:", threadId)
      return {
        taskId: null,
        messageId: ""
      }
    }

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

    return {
      taskId: task.id,
      messageId: message.id
    }
  }
}

