/**
 * Task Configuration API
 *
 * GET /api/task-instances/[id]/config — Returns the most recent configuration
 * for a task, used to auto-populate the automation wizard.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const taskId = params.id

    const task = await prisma.taskInstance.findFirst({
      where: { id: taskId, organizationId },
      select: {
        id: true,
        name: true,
        taskType: true,
        lineageId: true,
        reconciliationConfigId: true,
        reportDefinitionId: true,
        reportFilterBindings: true,
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const config: Record<string, unknown> = {}

    if (task.taskType === "reconciliation") {
      config.reconciliationConfigId = task.reconciliationConfigId
    } else if (task.taskType === "report") {
      config.reportDefinitionId = task.reportDefinitionId
      config.reportFilterBindings = task.reportFilterBindings
    } else if (task.taskType === "request" || task.taskType === "form") {
      // Look at the most recent EmailDraft for this task to find template info
      const latestDraft = await prisma.emailDraft.findFirst({
        where: { taskInstanceId: taskId, organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          subjectTemplate: true,
          bodyTemplate: true,
          htmlBodyTemplate: true,
          availableTags: true,
          personalizationMode: true,
          deadlineDate: true,
        },
      })

      if (latestDraft) {
        config.subjectTemplate = latestDraft.subjectTemplate
        config.bodyTemplate = latestDraft.bodyTemplate
        config.htmlBodyTemplate = latestDraft.htmlBodyTemplate
        config.availableTags = latestDraft.availableTags
        config.personalizationMode = latestDraft.personalizationMode
        config.deadlineDate = latestDraft.deadlineDate
      }

      // Also check for existing automation rules on this lineage to pull requestTemplateId
      if (task.lineageId) {
        const existingRule = await prisma.automationRule.findFirst({
          where: { lineageId: task.lineageId, organizationId },
          orderBy: { createdAt: "desc" },
          select: { actions: true },
        })
        if (existingRule?.actions) {
          const actions = existingRule.actions as { steps?: Array<{ actionParams?: Record<string, unknown> }> }
          const sendStep = actions.steps?.find(
            (s) => s.actionParams?.requestTemplateId
          )
          if (sendStep?.actionParams?.requestTemplateId) {
            config.requestTemplateId = sendStep.actionParams.requestTemplateId
          }
        }
      }

      // Get reminder config from most recent sent request
      const latestRequest = await prisma.request.findFirst({
        where: { taskInstanceId: taskId, organizationId, isDraft: false },
        orderBy: { createdAt: "desc" },
        select: {
          remindersEnabled: true,
          remindersFrequencyHours: true,
          remindersMaxCount: true,
          deadlineDate: true,
          scheduleConfig: true,
        },
      })

      if (latestRequest) {
        if (latestRequest.remindersEnabled) {
          const freqHours = latestRequest.remindersFrequencyHours || 168
          const frequency =
            freqHours <= 24 ? "daily" : freqHours <= 168 ? "weekly" : "biweekly"
          config.remindersConfig = {
            enabled: true,
            frequency,
            stopCondition: "reply_or_deadline",
          }
        }
        if (latestRequest.deadlineDate) {
          config.deadlineDate = latestRequest.deadlineDate
        }
        if (latestRequest.scheduleConfig) {
          config.scheduleConfig = latestRequest.scheduleConfig
        }
      }
    }

    return NextResponse.json({ task, config })
  } catch (error) {
    console.error("Error fetching task config:", error)
    return NextResponse.json(
      { error: "Failed to fetch task configuration" },
      { status: 500 }
    )
  }
}
