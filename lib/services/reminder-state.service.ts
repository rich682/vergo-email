import { prisma } from "@/lib/prisma"

type RemindersConfig = {
  enabled: boolean
  startDelayHours: number
  frequencyHours: number
  maxCount: number
  approved: boolean
}

export class ReminderStateService {
  static async initializeForTask(taskId: string, remindersConfig?: RemindersConfig) {
    if (!remindersConfig?.enabled || !remindersConfig?.approved) return

    const task = await prisma.task.findUnique({
      where: { id: taskId },
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

    if (!task || !task.entityId) return

    const startDelayHours = remindersConfig.startDelayHours ?? 48
    const frequencyHours = remindersConfig.frequencyHours ?? 72
    const maxCount = Math.min(5, remindersConfig.maxCount ?? 0)

    // Persist reminder configuration on the task (idempotent)
    await prisma.task.update({
      where: { id: taskId },
      data: {
        remindersEnabled: remindersConfig.enabled,
        remindersApproved: remindersConfig.approved,
        remindersStartDelayHours: startDelayHours,
        remindersFrequencyHours: frequencyHours,
        remindersMaxCount: maxCount
      }
    })

    // Idempotent initialization of ReminderState (one per task+entity)
    const existing = await prisma.reminderState.findUnique({
      where: {
        taskId_entityId: {
          taskId,
          entityId: task.entityId
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
        taskId,
        entityId: task.entityId,
        organizationId: task.organizationId,
        reminderNumber: 1,
        sentCount: 0,
        nextSendAt,
        lastSentAt: null,
        stoppedReason: null
      }
    })
  }

  static async stopForReply(taskId: string, entityId: string) {
    try {
      await prisma.reminderState.updateMany({
        where: {
          taskId,
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
}
