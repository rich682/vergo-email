/**
 * Workflow Action Handlers
 *
 * Maps workflow action types to existing service calls.
 * Each handler is headless (no session required) — it uses
 * organizationId + triggeredBy from the workflow run context.
 */

import { prisma } from "@/lib/prisma"
import { inngest } from "@/inngest/client"
import { canPerformAction } from "@/lib/permissions"
import { WorkflowAuditService } from "./audit.service"
import type { ActionType, ActionContext, StepResult } from "./types"

export interface ActionResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  targetType?: string
  targetId?: string
}

/**
 * Execute a workflow action step by dispatching to the correct handler.
 */
export async function executeAction(
  actionType: ActionType,
  actionParams: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  switch (actionType) {
    case "send_request":
      return handleSendRequest(actionParams, context)
    case "send_form":
      return handleSendForm(actionParams, context)
    case "complete_reconciliation":
      return handleCompleteReconciliation(actionParams, context)
    case "complete_report":
      return handleCompleteReport(actionParams, context)
    default:
      return { success: false, error: `Unknown action type: ${actionType}` }
  }
}

// ─── send_request ────────────────────────────────────────────────────────────

async function handleSendRequest(
  params: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const questId = params.questId as string
  if (!questId) {
    return { success: false, error: "Missing questId in actionParams" }
  }

  // Re-check permission at execution time
  const permCheck = await checkPermissionForAction(context, "inbox:send_emails")
  if (!permCheck.allowed) {
    return { success: false, error: permCheck.reason }
  }

  try {
    const { QuestService } = await import("@/lib/services/quest.service")
    const result = await QuestService.execute(questId, context.organizationId)

    return {
      success: true,
      data: {
        emailsSent: result.emailsSent,
        questId,
      },
      targetType: "quest",
      targetId: questId,
    }
  } catch (error: any) {
    return { success: false, error: error.message, targetType: "quest", targetId: questId }
  }
}

// ─── send_form ───────────────────────────────────────────────────────────────

async function handleSendForm(
  params: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const formDefinitionId = params.formDefinitionId as string
  const taskInstanceId = params.taskInstanceId as string
  const recipientEntityIds = params.recipientEntityIds as string[] | undefined
  const recipientUserIds = params.recipientUserIds as string[] | undefined

  if (!formDefinitionId || !taskInstanceId) {
    return { success: false, error: "Missing formDefinitionId or taskInstanceId in actionParams" }
  }

  const permCheck = await checkPermissionForAction(context, "forms:send")
  if (!permCheck.allowed) {
    return { success: false, error: permCheck.reason }
  }

  try {
    const { FormRequestService } = await import("@/lib/services/form-request.service")
    let totalCreated = 0

    if (recipientEntityIds && recipientEntityIds.length > 0) {
      const result = await FormRequestService.createBulkForEntities(
        context.organizationId,
        taskInstanceId,
        {
          formDefinitionId,
          recipientEntityIds,
          deadlineDate: params.deadlineDate ? new Date(params.deadlineDate as string) : undefined,
          reminderConfig: params.reminderConfig as any,
        }
      )
      totalCreated += result.count
    }

    if (recipientUserIds && recipientUserIds.length > 0) {
      const result = await FormRequestService.createBulk(
        context.organizationId,
        taskInstanceId,
        {
          formDefinitionId,
          recipientUserIds,
          deadlineDate: params.deadlineDate ? new Date(params.deadlineDate as string) : undefined,
          reminderConfig: params.reminderConfig as any,
        }
      )
      totalCreated += result.count
    }

    return {
      success: true,
      data: { formRequestsCreated: totalCreated, formDefinitionId },
      targetType: "form_request",
      targetId: formDefinitionId,
    }
  } catch (error: any) {
    return { success: false, error: error.message, targetType: "form_request", targetId: formDefinitionId }
  }
}

// ─── complete_reconciliation ─────────────────────────────────────────────────

async function handleCompleteReconciliation(
  params: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  // runId can come from actionParams or trigger context
  const runId = (params.runId as string) || (context.triggerContext.metadata.runId as string)
  if (!runId) {
    return { success: false, error: "Missing runId in actionParams or trigger context" }
  }

  const permCheck = await checkPermissionForAction(context, "reconciliations:resolve")
  if (!permCheck.allowed) {
    return { success: false, error: permCheck.reason }
  }

  try {
    const { ReconciliationService } = await import("@/lib/services/reconciliation.service")
    const userId = context.triggeredBy || "system"
    await ReconciliationService.completeRun(runId, context.organizationId, userId)

    return {
      success: true,
      data: { runId, completedBy: userId },
      targetType: "reconciliation_run",
      targetId: runId,
    }
  } catch (error: any) {
    return { success: false, error: error.message, targetType: "reconciliation_run", targetId: runId }
  }
}

// ─── complete_report ─────────────────────────────────────────────────────────

async function handleCompleteReport(
  params: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const reportDefinitionId = params.reportDefinitionId as string
  if (!reportDefinitionId) {
    return { success: false, error: "Missing reportDefinitionId in actionParams" }
  }

  // Derive periodKey: explicit param → trigger metadata → active board fallback
  let periodKey = (params.periodKey as string) || (context.triggerContext.metadata.periodKey as string)
  if (!periodKey) {
    // Attempt to derive from the org's most recent active board
    const activeBoard = await prisma.board.findFirst({
      where: {
        organizationId: context.organizationId,
        status: { in: ["IN_PROGRESS", "NOT_STARTED"] },
        periodStart: { not: null },
      },
      orderBy: { periodStart: "desc" },
      select: { periodStart: true, periodEnd: true },
    })
    if (activeBoard?.periodStart) {
      const start = activeBoard.periodStart.toISOString().split("T")[0]
      const end = activeBoard.periodEnd?.toISOString().split("T")[0] || start
      periodKey = `${start}_${end}`
    }
  }
  if (!periodKey) {
    return { success: false, error: "Missing periodKey in actionParams or trigger context, and no active board found" }
  }

  const permCheck = await checkPermissionForAction(context, "reports:generate")
  if (!permCheck.allowed) {
    return { success: false, error: permCheck.reason }
  }

  try {
    const { ReportGenerationService } = await import("@/lib/services/report-generation.service")
    const report = await ReportGenerationService.createManualReport({
      organizationId: context.organizationId,
      reportDefinitionId,
      periodKey,
      createdBy: context.triggeredBy || "system",
      filterBindings: params.filterBindings as Record<string, string[]> | undefined,
      name: params.name as string | undefined,
    })

    return {
      success: true,
      data: { reportId: report.id, periodKey },
      targetType: "report",
      targetId: report.id,
    }
  } catch (error: any) {
    return { success: false, error: error.message, targetType: "report", targetId: reportDefinitionId }
  }
}

// ─── agent_run (dispatches to Inngest, not a direct service call) ────────────

export async function handleAgentRun(
  agentDefinitionId: string,
  context: ActionContext
): Promise<ActionResult> {
  if (!agentDefinitionId) {
    return { success: false, error: "Missing agentDefinitionId" }
  }

  try {
    // Verify agent exists and belongs to org
    const agent = await prisma.agentDefinition.findFirst({
      where: { id: agentDefinitionId, organizationId: context.organizationId },
    })
    if (!agent) {
      return { success: false, error: `Agent ${agentDefinitionId} not found` }
    }

    // Dispatch agent/run event — the existing agent runner handles execution
    await inngest.send({
      name: "agent/run",
      data: {
        agentDefinitionId,
        organizationId: context.organizationId,
        triggeredBy: context.triggeredBy,
        reconciliationRunId: context.triggerContext.metadata.runId || null,
      },
    })

    return {
      success: true,
      data: { agentDefinitionId, dispatched: true },
      targetType: "agent_execution",
      targetId: agentDefinitionId,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      targetType: "agent_execution",
      targetId: agentDefinitionId,
    }
  }
}

// ─── Permission Helper ───────────────────────────────────────────────────────

async function checkPermissionForAction(
  context: ActionContext,
  requiredActionKey: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (!context.triggeredBy || context.triggeredBy === "system") {
    // System-triggered workflows bypass permission checks
    // (permissions were validated at rule creation time)
    return { allowed: true }
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: context.triggeredBy, organizationId: context.organizationId },
      select: { role: true },
    })

    if (!user) {
      return { allowed: false, reason: `User ${context.triggeredBy} not found` }
    }

    // Get org's action permissions
    const org = await prisma.organization.findUnique({
      where: { id: context.organizationId },
      select: { features: true },
    })

    const features = org?.features as Record<string, unknown> | null
    const orgActionPermissions = (features?.roleActionPermissions || {}) as Record<string, Record<string, boolean>>

    const allowed = canPerformAction(user.role as any, requiredActionKey as any, orgActionPermissions)
    if (!allowed) {
      return { allowed: false, reason: `PERMISSION_DENIED: User ${context.triggeredBy} lacks ${requiredActionKey}` }
    }

    return { allowed: true }
  } catch (error: any) {
    return { allowed: false, reason: `Permission check failed: ${error.message}` }
  }
}
