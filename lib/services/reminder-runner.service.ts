import { prisma } from "@/lib/prisma"
import { ReminderTemplateService } from "@/lib/services/reminder-template.service"
import { renderTemplate } from "@/lib/utils/template-renderer"
import { EmailSendingService } from "@/lib/services/email-sending.service"

export type ReminderRunResult = {
  remindersChecked: number
  remindersSent: number
  remindersSkipped: number
  errors?: string[]
}

/**
 * Executes the reminder/send-due logic once.
 * Shared between the scheduled Inngest function and the dev/manual trigger.
 */
export async function runDueRemindersOnce(): Promise<ReminderRunResult> {
  const now = new Date()

  const dueReminders = await prisma.reminderState.findMany({
    where: {
      nextSendAt: {
        lte: now
      },
      stoppedReason: null,
      task: {
        remindersEnabled: true,
        remindersApproved: true
      }
    },
    include: {
      task: {
        include: {
          entity: true,
          messages: {
            where: { direction: "OUTBOUND" },
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
  })

  if (dueReminders.length === 0) {
    console.log(JSON.stringify({ event: "reminder_due_none", timestampMs: Date.now() }))
    return {
      remindersChecked: 0,
      remindersSent: 0,
      remindersSkipped: 0
    }
  }

  console.log(JSON.stringify({ event: "reminder_due_found", count: dueReminders.length, timestampMs: Date.now() }))

  let remindersSent = 0
  let remindersSkipped = 0
  const errors: string[] = []

  for (const reminderState of dueReminders) {
    try {
      const task = reminderState.task
      const maxReminders = task.remindersMaxCount || 0

      if (!maxReminders) {
        await prisma.reminderState.update({
          where: { id: reminderState.id },
          data: { stoppedReason: "max_reached", nextSendAt: null }
        })
        remindersSkipped++
        console.log(JSON.stringify({ event: "reminder_stopped_maxed", taskId: task.id, reminderStateId: reminderState.id }))
        continue
      }

      // Compare-and-set claim to prevent double send
      const claimed = await prisma.reminderState.updateMany({
        where: {
          id: reminderState.id,
          stoppedReason: null,
          nextSendAt: { lte: now },
          sentCount: reminderState.sentCount
        },
        data: {
          nextSendAt: new Date(now.getTime() + 5 * 60 * 1000) // temporary hold
        }
      })

      if (claimed === 0) {
        remindersSkipped++
        console.log(JSON.stringify({ event: "reminder_skipped_claimed", reminderStateId: reminderState.id }))
        continue
      }

      // Stop condition: replied
      if (task.status === "REPLIED") {
        await prisma.reminderState.update({
          where: { id: reminderState.id },
          data: {
            stoppedReason: "replied",
            nextSendAt: null
          }
        })
        remindersSkipped++
        console.log(JSON.stringify({ event: "reminder_skipped_replied", taskId: task.id, reminderStateId: reminderState.id }))
        continue
      }

      // Max check
      if (reminderState.sentCount >= maxReminders) {
        await prisma.reminderState.update({
          where: { id: reminderState.id },
          data: {
            stoppedReason: "max_reached",
            nextSendAt: null
          }
        })
        remindersSkipped++
        console.log(JSON.stringify({ event: "reminder_stopped_maxed", taskId: task.id, reminderStateId: reminderState.id }))
        continue
      }

      const originalMessage = task.messages[0]
      if (!originalMessage) {
        errors.push(`Task ${task.id}: No original message`)
        console.error(JSON.stringify({ event: "reminder_send_failed", taskId: task.id, reminderStateId: reminderState.id, reason: "no_original_message" }))
        continue
      }

      const reminderNumber = reminderState.sentCount + 1
      const template = ReminderTemplateService.generateReminderTemplateWithDeadline({
        originalSubject: originalMessage.subject || task.campaignName || "Request",
        originalBody: originalMessage.body || originalMessage.htmlBody || "",
        reminderNumber,
        maxReminders,
        deadlineDate: task.deadlineDate
      })

      const personalizationData = {
        "First Name": task.entity.firstName || "",
        "Email": task.entity.email || ""
      }
      const renderedSubject = renderTemplate(template.subject, personalizationData).rendered
      const renderedBody = renderTemplate(template.body, personalizationData).rendered

      await EmailSendingService.sendEmailForExistingTask({
        taskId: task.id,
        entityId: task.entityId,
        organizationId: task.organizationId,
        to: task.entity.email || "",
        subject: renderedSubject,
        body: renderedBody,
        htmlBody: renderedBody
      })

      const frequencyHours = task.remindersFrequencyHours || 72
      const newSentCount = reminderState.sentCount + 1
      const shouldContinue = newSentCount < maxReminders

      await prisma.reminderState.update({
        where: { id: reminderState.id },
        data: {
          reminderNumber: reminderNumber + 1,
          sentCount: newSentCount,
          lastSentAt: now,
          nextSendAt: shouldContinue
            ? new Date(now.getTime() + frequencyHours * 60 * 60 * 1000)
            : null,
          stoppedReason: shouldContinue ? null : "max_reached"
        }
      })

      remindersSent++
      console.log(JSON.stringify({ event: "reminder_sent", taskId: task.id, reminderStateId: reminderState.id, reminderNumber }))
    } catch (error: any) {
      console.error(JSON.stringify({ event: "reminder_send_failed", reminderStateId: reminderState.id, error: error?.message }))
      errors.push(`Reminder ${reminderState.id}: ${error.message}`)
      // Do not update sentCount on failure; allow retry
    }
  }

  return {
    remindersChecked: dueReminders.length,
    remindersSent,
    remindersSkipped,
    errors: errors.length > 0 ? errors : undefined
  }
}
