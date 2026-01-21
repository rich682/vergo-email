import { prisma } from "@/lib/prisma"
import { Request, TaskStatus } from "@prisma/client"
import { EntityService } from "./entity.service"

export class RequestCreationService {
  static async createRequestFromEmail(data: {
    organizationId: string
    taskInstanceId?: string | null  // Parent TaskInstance for request-level association
    entityEmail: string
    entityName?: string
    campaignName?: string
    campaignType?: string
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
  }): Promise<Request> {
    // Find or create entity
    const entity = await EntityService.findOrCreateByEmail({
      email: data.entityEmail,
      firstName: data.entityName,
      organizationId: data.organizationId
    })

    // Create request with taskInstanceId
    return prisma.request.create({
      data: {
        organizationId: data.organizationId,
        taskInstanceId: data.taskInstanceId || null,
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
    requestId: string
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
    const providerData = data.providerData || {}
    const messageIdHeader = typeof providerData === 'object' && providerData !== null
      ? (providerData.messageIdHeader || providerData.internetMessageId || null)
      : null
    const threadId = typeof providerData === 'object' && providerData !== null
      ? (providerData.threadId || providerData.conversationId || null)
      : null

    await prisma.message.create({
      data: {
        requestId: data.requestId,
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
