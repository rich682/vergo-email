import { prisma } from "@/lib/prisma"
import { Request, TaskStatus } from "@prisma/client"
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
    requestId: string
    organizationId: string
    messageClassification?: MessageClassification
    hasAttachments?: boolean
    verified?: boolean
  }): Promise<{
    statusUpdated: boolean
    newStatus?: TaskStatus
    autoReplied: boolean
  }> {
    const request = await prisma.request.findUnique({
      where: { id: data.requestId },
      include: {
        entity: true
      }
    })

    if (!request) {
      throw new Error("Request not found")
    }

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

      const conditionsMet =
        (!ruleData.messageType ||
          !data.messageClassification ||
          ruleData.messageType.includes(data.messageClassification)) &&
        (ruleData.hasAttachments === undefined ||
          ruleData.hasAttachments === data.hasAttachments) &&
        (ruleData.verified === undefined ||
          ruleData.verified === data.verified)

      if (!conditionsMet) continue

      if (actions.setStatus) {
        await prisma.request.update({
          where: { id: data.requestId },
          data: { status: actions.setStatus }
        })
        statusUpdated = true
        newStatus = actions.setStatus
      }

      if (actions.autoFlag) {
        await prisma.request.update({
          where: { id: data.requestId },
          data: { status: "FLAGGED" }
        })
        statusUpdated = true
        newStatus = "FLAGGED"
      }

      if (actions.autoVerify && data.verified) {
        await prisma.request.update({
          where: { id: data.requestId },
          data: {
            status: "COMPLETE",
            aiVerified: true,
            verifiedAt: new Date()
          }
        })
        statusUpdated = true
        newStatus = "COMPLETE"
      }

      if (actions.autoReply && !autoReplied) {
        try {
          await EmailSendingService.sendEmail({
            organizationId: data.organizationId,
            to: request.entity?.email || "",
            subject: actions.autoReply.subject,
            body: actions.autoReply.body,
            campaignName: request.campaignName || undefined,
            campaignType: request.campaignType || undefined
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

