import { prisma } from "@/lib/prisma"
import { EmailSendingService } from "./email-sending.service"
import { EntityService } from "./entity.service"
import { parseExpression } from "cron-parser"
import { addMinutes } from "date-fns"

export class ScheduleExecutionService {
  static async executeSchedule(scheduleId: string): Promise<{
    emailsSent: number
    tasksCreated: number
  }> {
    const schedule = await prisma.agentSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        group: {
          include: {
            entities: {
              include: {
                entity: true
              }
            }
          }
        }
      }
    })

    if (!schedule || !schedule.isActive) {
      throw new Error("Schedule not found or inactive")
    }

    // Get recipients from group
    const recipients: Array<{ email: string; name?: string }> = []

    if (schedule.group) {
      for (const entityGroup of schedule.group.entities) {
        const entity = entityGroup.entity
        if (entity.email) {
          recipients.push({
            email: entity.email,
            name: entity.firstName
          })
        }
      }
    }

    if (recipients.length === 0) {
      return { emailsSent: 0, tasksCreated: 0 }
    }

    // Send emails
    const results = await EmailSendingService.sendBulkEmail({
      organizationId: schedule.organizationId,
      recipients,
      subject: schedule.emailSubject,
      body: schedule.emailBody,
      htmlBody: schedule.htmlBody || undefined,
      campaignName: schedule.campaignName || undefined,
      campaignType: schedule.campaignType || undefined
    })

    const successful = results.filter(r => !r.error)
    const tasksCreated = successful.length

    // Update schedule
    const nextRun = this.calculateNextRun(schedule.cronExpression, schedule.timezone)
    
    await prisma.agentSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
        nextRunAt: nextRun
      }
    })

    return {
      emailsSent: successful.length,
      tasksCreated
    }
  }

  static calculateNextRun(cronExpression: string, timezone: string): Date {
    try {
      const interval = parseExpression(cronExpression, {
        tz: timezone
      })
      return interval.next().toDate()
    } catch (error) {
      // Fallback: add 1 day if cron parsing fails
      return addMinutes(new Date(), 1440)
    }
  }

  static async getSchedulesToRun(): Promise<string[]> {
    const now = new Date()
    
    const schedules = await prisma.agentSchedule.findMany({
      where: {
        isActive: true,
        OR: [
          { nextRunAt: { lte: now } },
          { nextRunAt: null }
        ]
      },
      select: { id: true }
    })

    return schedules.map(s => s.id)
  }
}

