import { prisma } from "@/lib/prisma"
import { ScheduleExecutionService } from "./schedule-execution.service"

export class ScheduleCreationService {
  /**
   * Convert a specific date/time to a one-time cron expression
   * Format: minute hour day month day-of-week
   * Example: "2025-01-15T14:30:00" → "30 14 15 1 *"
   */
  static convertDateTimeToCron(dateTime: Date): string {
    const date = new Date(dateTime)
    const minute = date.getMinutes()
    const hour = date.getHours()
    const day = date.getDate()
    const month = date.getMonth() + 1 // JavaScript months are 0-indexed, cron uses 1-indexed
    // For one-time schedules, we use * for day-of-week
    return `${minute} ${hour} ${day} ${month} *`
  }

  /**
   * Create an AgentSchedule from draft data
   */
  static async createScheduleFromDraft(data: {
    organizationId: string
    draftId: string
    scheduleDateTime: Date
    groupId: string
    scheduleName: string
    emailSubject: string
    emailBody: string
    htmlBody?: string
    campaignName?: string
    timezone?: string
  }): Promise<{
    id: string
    nextRunAt: Date
  }> {
    // Convert date/time to cron expression
    const cronExpression = this.convertDateTimeToCron(data.scheduleDateTime)

    // Calculate next run time
    const nextRunAt = ScheduleExecutionService.calculateNextRun(
      cronExpression,
      data.timezone || "UTC"
    )

    // Create the schedule
    const schedule = await prisma.agentSchedule.create({
      data: {
        name: data.scheduleName,
        cronExpression,
        timezone: data.timezone || "UTC",
        organizationId: data.organizationId,
        groupId: data.groupId,
        campaignName: data.campaignName || null,
        emailSubject: data.emailSubject,
        emailBody: data.emailBody,
        htmlBody: data.htmlBody || null,
        nextRunAt,
        isActive: true
      }
    })

    return {
      id: schedule.id,
      nextRunAt: schedule.nextRunAt!
    }
  }

  /**
   * Validate that a schedule date/time is in the future
   */
  static validateScheduleDateTime(dateTime: Date): { valid: boolean; error?: string } {
    const now = new Date()
    if (dateTime <= now) {
      return {
        valid: false,
        error: "Schedule date/time must be in the future"
      }
    }
    return { valid: true }
  }
}











