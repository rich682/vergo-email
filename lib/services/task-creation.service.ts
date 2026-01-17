import { prisma } from "@/lib/prisma"
import { Task, TaskStatus } from "@prisma/client"
import { EntityService } from "./entity.service"
import { v4 as uuidv4 } from "uuid"

export class TaskCreationService {
  static async createTaskFromEmail(data: {
    organizationId: string
    jobId?: string | null  // Parent Job/Item for request-level association
    entityEmail: string
    entityName?: string
    campaignName?: string  // Optional grouping name
    campaignType?: string  // Optional type classification
    threadId: string
    replyToEmail: string
    subject?: string
    deadlineDate?: Date | null
    remindersConfig?: {
      enabled: boolean
      startDelayHours: number
      frequencyHours: number
      maxCount: number
      approved: boolean
    }
  }): Promise<Task> {
    // Find or create entity
    const entity = await EntityService.findOrCreateByEmail({
      email: data.entityEmail,
      firstName: data.entityName,
      organizationId: data.organizationId
    })

    // Create task with jobId for direct Item association
    return prisma.task.create({
      data: {
        organizationId: data.organizationId,
        jobId: data.jobId || null,
        entityId: entity.id,
        campaignName: data.campaignName || null,
        campaignType: data.campaignType as any || null,
        status: "NO_REPLY",
        threadId: data.threadId,
        replyToEmail: data.replyToEmail,
        deadlineDate: data.deadlineDate || null,
        remindersEnabled: data.remindersConfig?.enabled || false,
        remindersStartDelayHours: data.remindersConfig?.enabled ? data.remindersConfig.startDelayHours : null,
        remindersFrequencyHours: data.remindersConfig?.enabled ? data.remindersConfig.frequencyHours : null,
        remindersMaxCount: data.remindersConfig?.enabled ? data.remindersConfig.maxCount : null,
        remindersApproved: data.remindersConfig?.enabled ? data.remindersConfig.approved : false
      }
    })
  }

  static async logOutboundMessage(data: {
    taskId: string
    entityId: string
    subject: string
    body: string
    htmlBody?: string
    fromAddress: string
    toAddress: string
    providerId?: string
    providerData?: any
    trackingToken?: string
  }): Promise<void> {
    // Extract messageIdHeader and threadId from providerData for efficient reply matching
    const providerData = data.providerData || {}
    const messageIdHeader = typeof providerData === 'object' && providerData !== null
      ? (providerData.messageIdHeader || providerData.internetMessageId || null)
      : null
    const threadId = typeof providerData === 'object' && providerData !== null
      ? (providerData.threadId || providerData.conversationId || null)
      : null

    // Log for debugging reply matching
    console.log(`[TaskCreation] Logging outbound message:`, {
      taskId: data.taskId,
      toAddress: data.toAddress,
      subject: data.subject?.substring(0, 50),
      messageIdHeader: messageIdHeader || 'MISSING!',
      threadId: threadId || 'N/A',
      providerDataKeys: Object.keys(providerData)
    })

    if (!messageIdHeader) {
      console.warn(`[TaskCreation] WARNING: No messageIdHeader found in providerData! Reply matching may fail.`)
      console.warn(`[TaskCreation] providerData:`, JSON.stringify(providerData))
    }

    await prisma.message.create({
      data: {
        taskId: data.taskId,
        entityId: data.entityId,
        direction: "OUTBOUND",
        channel: "EMAIL",
        subject: data.subject,
        body: data.body,
        htmlBody: data.htmlBody,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        providerId: data.providerId,
        providerData: data.providerData || null,
        messageIdHeader: messageIdHeader ? String(messageIdHeader) : null,
        threadId: threadId ? String(threadId) : null,
        trackingToken: data.trackingToken || null
      }
    })
  }
}

