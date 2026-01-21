import { prisma } from "@/lib/prisma"

type RemindersConfig = {
  enabled: boolean
  startDelayHours: number
  frequencyHours: number
  maxCount: number
  approved: boolean
}

export class ReminderStateService {
  static async initializeForRequest(requestId: string, remindersConfig?: RemindersConfig) {
    if (!remindersConfig?.enabled || !remindersConfig?.approved) return

    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        entityId: true,
        organizationId: true,
        remindersEnabled: true,
        remindersStartDelayHours: true,
        remindersFrequencyHours: true,
        remindersMaxCount: true,
        remindersApproved: true
      }
    })

    if (!request || !request.entityId) return

    const startDelayHours = remindersConfig.startDelayHours ?? 48
    const frequencyHours = remindersConfig.frequencyHours ?? 72
    const maxCount = Math.min(5, remindersConfig.maxCount ?? 0)

    // Persist reminder configuration on the request
    await prisma.request.update({
      where: { id: requestId },
      data: {
        remindersEnabled: remindersConfig.enabled,
        remindersApproved: remindersConfig.approved,
        remindersStartDelayHours: startDelayHours,
        remindersFrequencyHours: frequencyHours,
        remindersMaxCount: maxCount
      }
    })

    // Idempotent initialization of ReminderState
    const existing = await prisma.reminderState.findUnique({
      where: {
        requestId_entityId: {
          requestId,
          entityId: request.entityId
        }
      }
    })

    if (existing) {
      return existing
    }

    const now = Date.now()
    const nextSendAt = new Date(now + startDelayHours * 60 * 60 * 1000)

    return prisma.reminderState.create({
      data: {
        requestId,
        entityId: request.entityId,
        organizationId: request.organizationId,
        reminderNumber: 1,
        sentCount: 0,
        nextSendAt,
        lastSentAt: null,
        stoppedReason: null
      }
    })
  }

  static async stopForReply(requestId: string, entityId: string) {
    try {
      await prisma.reminderState.updateMany({
        where: {
          requestId,
          entityId
        },
        data: {
          stoppedReason: "replied",
          nextSendAt: null
        }
      })
    } catch (error) {
      console.error("[ReminderStateService] Failed to stop reminders on reply:", error)
    }
  }

  static async stopForReplyIfNotBounce(
    requestId: string, 
    entityId: string, 
    classification?: string | null
  ) {
    const nonStopClassifications = ["BOUNCE", "OUT_OF_OFFICE"]
    if (classification && nonStopClassifications.includes(classification.toUpperCase())) {
      console.log(`[ReminderStateService] Not stopping reminders for ${classification} classification (requestId: ${requestId})`)
      return
    }

    await this.stopForReply(requestId, entityId)
  }
}
