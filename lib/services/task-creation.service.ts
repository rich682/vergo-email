import { prisma } from "@/lib/prisma"
import { Task, TaskStatus } from "@prisma/client"
import { EntityService } from "./entity.service"
import { v4 as uuidv4 } from "uuid"

export class TaskCreationService {
  static async createTaskFromEmail(data: {
    organizationId: string
    entityEmail: string
    entityName?: string
    campaignName?: string
    campaignType?: string
    threadId: string
    replyToEmail: string
    subject?: string
    deadlineDate?: Date | null
  }): Promise<Task> {
    // Find or create entity
    const entity = await EntityService.findOrCreateByEmail({
      email: data.entityEmail,
      firstName: data.entityName,
      organizationId: data.organizationId
    })

    // Create task
    return prisma.task.create({
      data: {
        organizationId: data.organizationId,
        entityId: entity.id,
        campaignName: data.campaignName || null,
        campaignType: data.campaignType as any || null,
        status: "AWAITING_RESPONSE",
        threadId: data.threadId,
        replyToEmail: data.replyToEmail,
        deadlineDate: data.deadlineDate || null
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
        trackingToken: data.trackingToken || null
      }
    })
  }
}

