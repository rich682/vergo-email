import { prisma } from "@/lib/prisma"
import { Task, TaskStatus } from "@prisma/client"
import { EmailSendingService } from "./email-sending.service"
import { MessageClassification } from "./ai-classification.service"

export interface AutomationRule {
  trigger: string
  conditions: {
    messageType?: MessageClassification[]
    hasAttachments?: boolean
    verified?: boolean
  }
  actions: {
    autoReply?: {
      subject: string
      body: string
    }
    autoVerify?: boolean
    autoFlag?: boolean
    setStatus?: TaskStatus
  }
}

export class AutomationEngineService {
  static async executeRules(data: {
    taskId: string
    organizationId: string
    messageClassification?: MessageClassification
    hasAttachments?: boolean
    verified?: boolean
  }): Promise<{
    statusUpdated: boolean
    newStatus?: TaskStatus
    autoReplied: boolean
  }> {
    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
      include: {
        entity: true
      }
    })

    if (!task) {
      throw new Error("Task not found")
    }

    // Get automation rules (all rules are now global, campaign matching can be done via conditions)
    const allRules = await prisma.automationRule.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true
      }
    })

    let statusUpdated = false
    let newStatus: TaskStatus | undefined
    let autoReplied = false

    for (const rule of allRules) {
      const ruleData = rule.conditions as AutomationRule["conditions"]
      const actions = rule.actions as AutomationRule["actions"]

      // Check conditions
      const conditionsMet =
        (!ruleData.messageType ||
          !data.messageClassification ||
          ruleData.messageType.includes(data.messageClassification)) &&
        (ruleData.hasAttachments === undefined ||
          ruleData.hasAttachments === data.hasAttachments) &&
        (ruleData.verified === undefined ||
          ruleData.verified === data.verified)

      if (!conditionsMet) continue

      // Execute actions
      if (actions.setStatus) {
        await prisma.task.update({
          where: { id: data.taskId },
          data: { status: actions.setStatus }
        })
        statusUpdated = true
        newStatus = actions.setStatus
      }

      if (actions.autoFlag) {
        await prisma.task.update({
          where: { id: data.taskId },
          data: { status: "FLAGGED" }
        })
        statusUpdated = true
        newStatus = "FLAGGED"
      }

      if (actions.autoVerify && data.verified) {
        await prisma.task.update({
          where: { id: data.taskId },
          data: {
            status: "FULFILLED",
            aiVerified: true,
            verifiedAt: new Date()
          }
        })
        statusUpdated = true
        newStatus = "FULFILLED"
      }

      if (actions.autoReply && !autoReplied) {
        try {
          await EmailSendingService.sendEmail({
            organizationId: data.organizationId,
            to: task.entity.email || "",
            subject: actions.autoReply.subject,
            body: actions.autoReply.body,
            campaignName: task.campaignName || undefined,
            campaignType: task.campaignType || undefined
          })
          autoReplied = true
        } catch (error) {
          console.error("Error sending auto-reply:", error)
        }
      }
    }

    return {
      statusUpdated,
      newStatus,
      autoReplied
    }
  }
}

