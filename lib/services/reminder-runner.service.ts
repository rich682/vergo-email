import { prisma } from "@/lib/prisma"
import { ReminderTemplateService } from "@/lib/services/reminder-template.service"
import { renderTemplate } from "@/lib/utils/template-renderer"
import { EmailSendingService } from "@/lib/services/email-sending.service"
import { FormNotificationService } from "@/lib/services/form-notification.service"

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
      request: {
        remindersEnabled: true,
        remindersApproved: true
      }
    },
    include: {
      request: {
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
      const request = reminderState.request
      const maxReminders = request.remindersMaxCount || 0

      if (!maxReminders) {
        await prisma.reminderState.update({
          where: { id: reminderState.id },
          data: { stoppedReason: "max_reached", nextSendAt: null }
        })
        remindersSkipped++
        console.log(JSON.stringify({ event: "reminder_stopped_maxed", requestId: request.id, reminderStateId: reminderState.id }))
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

      if (claimed.count === 0) {
        remindersSkipped++
        console.log(JSON.stringify({ event: "reminder_skipped_claimed", reminderStateId: reminderState.id }))
        continue
      }

      // Stop condition: replied
      if (request.status === "REPLIED") {
        await prisma.reminderState.update({
          where: { id: reminderState.id },
          data: {
            stoppedReason: "replied",
            nextSendAt: null
          }
        })
        remindersSkipped++
        console.log(JSON.stringify({ event: "reminder_skipped_replied", requestId: request.id, reminderStateId: reminderState.id }))
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
        console.log(JSON.stringify({ event: "reminder_stopped_maxed", requestId: request.id, reminderStateId: reminderState.id }))
        continue
      }

      const originalMessage = request.messages[0]
      if (!originalMessage) {
        errors.push(`Request ${request.id}: No original message`)
        console.error(JSON.stringify({ event: "reminder_send_failed", requestId: request.id, reminderStateId: reminderState.id, reason: "no_original_message" }))
        continue
      }

      const reminderNumber = reminderState.sentCount + 1
      const template = ReminderTemplateService.generateReminderTemplateWithDeadline({
        originalSubject: originalMessage.subject || request.campaignName || "Request",
        originalBody: originalMessage.body || originalMessage.htmlBody || "",
        reminderNumber,
        maxReminders,
        deadlineDate: request.deadlineDate
      })

      const personalizationData = {
        "First Name": request.entity?.firstName || "",
        "Email": request.entity?.email || ""
      }
      const renderedSubject = renderTemplate(template.subject, personalizationData).rendered
      const renderedBody = renderTemplate(template.body, personalizationData).rendered

      await EmailSendingService.sendEmailForExistingTask({
        taskId: request.id,
        entityId: request.entityId!,
        organizationId: request.organizationId,
        to: request.entity?.email || "",
        subject: renderedSubject,
        body: renderedBody,
        htmlBody: renderedBody
      })

      const frequencyHours = request.remindersFrequencyHours || 72
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
      console.log(JSON.stringify({ event: "reminder_sent", requestId: request.id, reminderStateId: reminderState.id, reminderNumber }))
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

/**
 * Executes the form reminder logic once.
 * Sends reminders for pending form requests.
 */
export async function runDueFormRemindersOnce(): Promise<ReminderRunResult> {
  const now = new Date()

  // Find form requests due for reminders
  const dueFormRequests = await prisma.formRequest.findMany({
    where: {
      status: "PENDING",
      remindersEnabled: true,
      nextReminderAt: {
        lte: now
      },
      // Only send if we haven't hit max reminders
      AND: [
        {
          remindersSent: {
            lt: (prisma as any).raw("reminders_max_count")
          }
        }
      ]
    },
    include: {
      recipientUser: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      formDefinition: {
        select: {
          name: true
        }
      },
      taskInstance: {
        select: {
          name: true,
          owner: {
            select: {
              name: true,
              email: true
            }
          }
        }
      }
    }
  })

  if (dueFormRequests.length === 0) {
    console.log(JSON.stringify({ event: "form_reminder_due_none", timestampMs: Date.now() }))
    return {
      remindersChecked: 0,
      remindersSent: 0,
      remindersSkipped: 0
    }
  }

  console.log(JSON.stringify({ event: "form_reminder_due_found", count: dueFormRequests.length, timestampMs: Date.now() }))

  let remindersSent = 0
  let remindersSkipped = 0
  const errors: string[] = []

  for (const formRequest of dueFormRequests) {
    try {
      // Double-check we're still under max
      if (formRequest.remindersSent >= formRequest.remindersMaxCount) {
        await prisma.formRequest.update({
          where: { id: formRequest.id },
          data: { nextReminderAt: null }
        })
        remindersSkipped++
        continue
      }

      const reminderNumber = formRequest.remindersSent + 1

      // Send reminder email
      const success = await FormNotificationService.sendFormReminderEmail({
        formRequestId: formRequest.id,
        recipientEmail: formRequest.recipientUser!.email,
        recipientName: formRequest.recipientUser!.name,
        formName: formRequest.formDefinition.name,
        taskName: formRequest.taskInstance.name,
        senderName: formRequest.taskInstance.owner?.name || null,
        senderEmail: formRequest.taskInstance.owner?.email || "",
        deadlineDate: formRequest.deadlineDate,
        boardPeriod: null, // Could be enhanced to include period
        reminderNumber,
        maxReminders: formRequest.remindersMaxCount,
        organizationId: formRequest.organizationId
      })

      if (!success) {
        errors.push(`FormRequest ${formRequest.id}: Failed to send email`)
        continue
      }

      // Update reminder state
      const newSentCount = formRequest.remindersSent + 1
      const shouldContinue = newSentCount < formRequest.remindersMaxCount
      const nextReminderAt = shouldContinue
        ? new Date(now.getTime() + formRequest.reminderFrequencyHours * 60 * 60 * 1000)
        : null

      await prisma.formRequest.update({
        where: { id: formRequest.id },
        data: {
          remindersSent: newSentCount,
          nextReminderAt
        }
      })

      remindersSent++
      console.log(JSON.stringify({ 
        event: "form_reminder_sent", 
        formRequestId: formRequest.id, 
        reminderNumber 
      }))
    } catch (error: any) {
      console.error(JSON.stringify({ 
        event: "form_reminder_send_failed", 
        formRequestId: formRequest.id, 
        error: error?.message 
      }))
      errors.push(`FormRequest ${formRequest.id}: ${error.message}`)
    }
  }

  return {
    remindersChecked: dueFormRequests.length,
    remindersSent,
    remindersSkipped,
    errors: errors.length > 0 ? errors : undefined
  }
}
