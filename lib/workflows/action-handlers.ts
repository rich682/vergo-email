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
import type { ActionType, ActionContext, StepResult, SendRequestActionParams } from "./types"

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
    case "run_reconciliation":
      return handleRunReconciliation(actionParams, context)
    case "complete_reconciliation":
      return handleCompleteReconciliation(actionParams, context)
    case "complete_report":
      return handleCompleteReport(actionParams, context)
    default:
      return { success: false, error: `This agent uses an unsupported action type. Please contact support.` }
  }
}

// ─── send_request ────────────────────────────────────────────────────────────

async function handleSendRequest(
  params: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  // V2 path: requestTemplateId + recipientSourceType
  if (params.requestTemplateId) {
    return handleSendRequestV2(params as unknown as SendRequestActionParams, context)
  }

  // Legacy path: questId-based execution
  return handleSendRequestLegacy(params, context)
}

/** Legacy handler — delegates to QuestService.execute() */
async function handleSendRequestLegacy(
  params: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const questId = params.questId as string
  if (!questId) {
    return { success: false, error: "No email template configured. Please re-create this agent and ensure the linked task has sent at least one request." }
  }

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

/**
 * V2 handler — uses RequestTemplate for content + flexible recipient sources.
 *
 * 1. Loads the RequestTemplate (subject/body with {{Tag}} placeholders)
 * 2. Resolves recipients based on recipientSourceType
 * 3. Renders per-recipient personalized emails
 * 4. Sends via EmailSendingService.sendBulkEmail()
 */
async function handleSendRequestV2(
  params: SendRequestActionParams,
  context: ActionContext
): Promise<ActionResult> {
  const { requestTemplateId, recipientSourceType } = params
  if (!requestTemplateId) {
    return { success: false, error: "No email template configured. Please re-create this agent and ensure the linked task has sent at least one request." }
  }
  if (!recipientSourceType) {
    return { success: false, error: "No recipient source configured. Please re-create this agent." }
  }

  const permCheck = await checkPermissionForAction(context, "inbox:send_emails")
  if (!permCheck.allowed) {
    return { success: false, error: permCheck.reason }
  }

  try {
    // 1. Load request template
    const template = await prisma.requestTemplate.findFirst({
      where: { id: requestTemplateId, organizationId: context.organizationId },
    })
    if (!template) {
      return { success: false, error: "The email template for this agent could not be found. It may have been deleted. Please re-create the agent." }
    }

    // 2. Resolve recipients based on source type
    const { renderTemplate } = await import("@/lib/utils/template-renderer")
    const { EmailSendingService } = await import("@/lib/services/email-sending.service")

    let recipients: Array<{ email: string; name?: string }>
    let perRecipientEmails: Array<{ email: string; subject: string; body: string; htmlBody: string }>

    if (recipientSourceType === "database") {
      // Database source — resolve from database rows
      const { resolveDatabaseRecipients } = await import("@/lib/services/database-recipient.service")

      if (!params.databaseId || !params.emailColumnKey) {
        return { success: false, error: "Database recipient configuration is incomplete. Please check the database and email column settings." }
      }

      const dbResult = await resolveDatabaseRecipients(
        context.organizationId,
        params.databaseId,
        params.emailColumnKey,
        params.nameColumnKey,
        params.filters || []
      )

      recipients = dbResult.recipients.map((r) => ({ email: r.email, name: r.name }))
      perRecipientEmails = dbResult.recipients.map((r) => {
        const subjectResult = renderTemplate(template.subjectTemplate, r.personalizationData)
        const bodyResult = renderTemplate(template.bodyTemplate, r.personalizationData)
        const htmlResult = template.htmlBodyTemplate
          ? renderTemplate(template.htmlBodyTemplate, r.personalizationData)
          : null
        return {
          email: r.email,
          subject: subjectResult.rendered,
          body: bodyResult.rendered,
          htmlBody: htmlResult?.rendered || bodyResult.rendered,
        }
      })
    } else if (recipientSourceType === "task_history") {
      // Task history source — resolve recipients from the linked task's previous period requests
      const lineageId = params.lineageId || context.lineageId
      if (!lineageId) {
        return { success: false, error: "This agent requires a recurring task (one that repeats across periods) to find previous recipients. The linked task does not have a recurring history. Please re-create the agent and link it to a recurring task." }
      }

      // Find the most recent task instance in this lineage that has sent requests
      const priorTask = await prisma.taskInstance.findFirst({
        where: {
          lineageId,
          organizationId: context.organizationId,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })

      if (!priorTask) {
        return { success: false, error: "No previous task found to inherit recipients from. Make sure the linked task has sent at least one request." }
      }

      // Get sent requests from the prior task to extract recipients
      const priorRequests = await prisma.request.findMany({
        where: {
          taskInstanceId: priorTask.id,
          organizationId: context.organizationId,
          isDraft: false,
        },
        select: {
          entityId: true,
          entity: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      })

      if (priorRequests.length === 0) {
        return {
          success: true,
          data: { emailsSent: 0, requestTemplateId, reason: "No prior requests found for task history" },
          targetType: "request_template",
          targetId: requestTemplateId,
        }
      }

      // Deduplicate by email and filter out requests without contacts
      const seen = new Set<string>()
      const uniqueRequests = priorRequests.filter((r): r is typeof r & { entity: NonNullable<typeof r.entity> } => {
        if (!r.entity?.email || seen.has(r.entity.email)) return false
        seen.add(r.entity.email)
        return true
      })

      recipients = uniqueRequests.map((r) => ({
        email: r.entity!.email!,
        name: r.entity!.firstName || undefined,
      }))

      perRecipientEmails = uniqueRequests.map((r) => {
        const data: Record<string, string> = {
          "First Name": r.entity!.firstName || "",
          "Last Name": r.entity!.lastName || "",
          "Email": r.entity!.email!,
        }
        const subjectResult = renderTemplate(template.subjectTemplate, data)
        const bodyResult = renderTemplate(template.bodyTemplate, data)
        const htmlResult = template.htmlBodyTemplate
          ? renderTemplate(template.htmlBodyTemplate, data)
          : null
        return {
          email: r.entity!.email!,
          subject: subjectResult.rendered,
          body: bodyResult.rendered,
          htmlBody: htmlResult?.rendered || bodyResult.rendered,
        }
      })
    } else {
      // Contact-based sources — use existing recipient resolution
      const { resolveRecipientsWithReasons, buildRecipientPersonalizationData } = await import(
        "@/lib/services/recipient-filter.service"
      )

      let recipientSelection: { entityIds?: string[]; groupIds?: string[]; contactTypes?: string[] } = {}

      if (recipientSourceType === "contact_types" && params.contactTypes?.length) {
        recipientSelection = { contactTypes: params.contactTypes }
      } else if (recipientSourceType === "groups" && params.groupIds?.length) {
        recipientSelection = { groupIds: params.groupIds }
      } else if (recipientSourceType === "specific_contacts" && params.entityIds?.length) {
        recipientSelection = { entityIds: params.entityIds }
      } else if (recipientSourceType === "specific_users" && params.userIds?.length) {
        // For users, resolve their emails directly
        const users = await prisma.user.findMany({
          where: {
            id: { in: params.userIds },
            organizationId: context.organizationId,
          },
          select: { id: true, email: true, name: true },
        })

        recipients = users.map((u) => ({ email: u.email, name: u.name || undefined }))
        perRecipientEmails = users.map((u) => {
          const data: Record<string, string> = {
            "First Name": u.name?.split(" ")[0] || "",
            "Email": u.email,
          }
          const subjectResult = renderTemplate(template.subjectTemplate, data)
          const bodyResult = renderTemplate(template.bodyTemplate, data)
          const htmlResult = template.htmlBodyTemplate
            ? renderTemplate(template.htmlBodyTemplate, data)
            : null
          return {
            email: u.email,
            subject: subjectResult.rendered,
            body: bodyResult.rendered,
            htmlBody: htmlResult?.rendered || bodyResult.rendered,
          }
        })

        // Skip the resolveRecipientsWithReasons call below
        return await sendAndReturn(
          EmailSendingService,
          context,
          template,
          recipients,
          perRecipientEmails,
          params,
          requestTemplateId
        )
      } else {
        return { success: false, error: "No recipients are configured for this agent. Please check the recipient settings." }
      }

      const resolved = await resolveRecipientsWithReasons(context.organizationId, recipientSelection)

      recipients = resolved.recipients.map((r) => ({ email: r.email, name: r.firstName || r.name || undefined }))
      perRecipientEmails = resolved.recipients.map((r) => {
        const data = buildRecipientPersonalizationData(r)
        const subjectResult = renderTemplate(template.subjectTemplate, data)
        const bodyResult = renderTemplate(template.bodyTemplate, data)
        const htmlResult = template.htmlBodyTemplate
          ? renderTemplate(template.htmlBodyTemplate, data)
          : null
        return {
          email: r.email,
          subject: subjectResult.rendered,
          body: bodyResult.rendered,
          htmlBody: htmlResult?.rendered || bodyResult.rendered,
        }
      })
    }

    return await sendAndReturn(
      EmailSendingService,
      context,
      template,
      recipients,
      perRecipientEmails,
      params,
      requestTemplateId
    )
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      targetType: "request_template",
      targetId: requestTemplateId,
    }
  }
}

/** Shared send + result builder for V2 handler */
async function sendAndReturn(
  EmailSendingService: any,
  context: ActionContext,
  template: { subjectTemplate: string; bodyTemplate: string },
  recipients: Array<{ email: string; name?: string }>,
  perRecipientEmails: Array<{ email: string; subject: string; body: string; htmlBody: string }>,
  params: SendRequestActionParams,
  requestTemplateId: string
): Promise<ActionResult> {
  if (recipients.length === 0) {
    return {
      success: true,
      data: { emailsSent: 0, requestTemplateId, reason: "No recipients resolved" },
      targetType: "request_template",
      targetId: requestTemplateId,
    }
  }

  const deadlineDate = params.deadlineDate ? new Date(params.deadlineDate) : null

  // Map reminders config to the format expected by EmailSendingService
  let remindersConfig: any = undefined
  if (params.remindersConfig?.enabled) {
    const frequencyHours =
      params.remindersConfig.frequency === "daily" ? 24 :
      params.remindersConfig.frequency === "weekly" ? 168 : 336 // biweekly
    remindersConfig = {
      enabled: true,
      startDelayHours: frequencyHours,
      frequencyHours,
      maxCount: 10,
      approved: true,
    }
  }

  const results = await EmailSendingService.sendBulkEmail({
    organizationId: context.organizationId,
    userId: context.triggeredBy || undefined,
    recipients,
    subject: template.subjectTemplate,
    body: template.bodyTemplate,
    perRecipientEmails,
    deadlineDate,
    remindersConfig,
  })

  const successful = results.filter((r: any) => !r.error)

  return {
    success: true,
    data: {
      emailsSent: successful.length,
      totalRecipients: recipients.length,
      requestTemplateId,
    },
    targetType: "request_template",
    targetId: requestTemplateId,
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
    return { success: false, error: "Form configuration is incomplete. Please re-create this agent and ensure the linked task has a form set up." }
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

// ─── run_reconciliation ──────────────────────────────────────────────────────

/**
 * Full reconciliation lifecycle:
 * 1. Load config → verify it's database_database
 * 2. Resolve periodKey from trigger context or active board
 * 3. Create a new ReconciliationRun
 * 4. Load database rows (with period filtering)
 * 5. Run matching engine
 * 6. Save results → status = REVIEW
 */
async function handleRunReconciliation(
  params: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const reconciliationConfigId = params.reconciliationConfigId as string
  if (!reconciliationConfigId) {
    return { success: false, error: "No reconciliation configuration linked. Please re-create this agent and link it to a task with a Database vs Database reconciliation." }
  }

  const permCheck = await checkPermissionForAction(context, "reconciliations:manage")
  if (!permCheck.allowed) {
    return { success: false, error: permCheck.reason }
  }

  try {
    // 1. Load config
    const config = await prisma.reconciliationConfig.findFirst({
      where: { id: reconciliationConfigId, organizationId: context.organizationId },
      select: {
        id: true,
        name: true,
        sourceType: true,
        sourceAConfig: true,
        sourceBConfig: true,
        matchingRules: true,
      },
    })

    if (!config) {
      return { success: false, error: "The reconciliation configuration could not be found. It may have been deleted." }
    }

    if (config.sourceType !== "database_database") {
      return { success: false, error: "Automated reconciliation requires a Database vs Database configuration. The linked reconciliation uses file uploads which cannot be automated." }
    }

    // 2. Resolve periodKey from trigger context or active board
    let periodKey = (params.periodKey as string) || (context.triggerContext.metadata.periodKey as string)
    if (!periodKey) {
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

    // 3. Find the task instance linked to this config (for run association)
    const linkedTask = await prisma.taskInstance.findFirst({
      where: {
        reconciliationConfigId,
        organizationId: context.organizationId,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, boardId: true },
    })

    // 4. Create a new run
    const { ReconciliationService } = await import("@/lib/services/reconciliation.service")
    const run = await ReconciliationService.createRun({
      organizationId: context.organizationId,
      configId: reconciliationConfigId,
      boardId: linkedTask?.boardId || undefined,
      taskInstanceId: linkedTask?.id || undefined,
    })

    // 5. Load database rows (with period filtering)
    const { populateRunFromDatabases } = await import("@/lib/services/reconciliation-database.service")
    const loadResult = await populateRunFromDatabases({
      runId: run.id,
      organizationId: context.organizationId,
      sourceAConfig: config.sourceAConfig as any,
      sourceBConfig: config.sourceBConfig as any,
      periodKey: periodKey || undefined,
    })

    // 6. Set run to PROCESSING and run matching engine
    const { ReconciliationRunStatus } = await import("@prisma/client")
    await ReconciliationService.updateRunStatus(run.id, context.organizationId, ReconciliationRunStatus.PROCESSING)

    const { ReconciliationMatchingService } = await import("@/lib/services/reconciliation-matching.service")

    // Get the full run with loaded rows
    const fullRun = await ReconciliationService.getRun(run.id, context.organizationId)
    if (!fullRun) {
      return { success: false, error: "Run was created but could not be loaded", targetType: "reconciliation_run", targetId: run.id }
    }

    const sourceAConfig = config.sourceAConfig as any
    const sourceBConfig = config.sourceBConfig as any
    const matchingRules = config.matchingRules as any

    const result = await ReconciliationMatchingService.runMatching(
      (fullRun.sourceARows || []) as Record<string, any>[],
      (fullRun.sourceBRows || []) as Record<string, any>[],
      sourceAConfig,
      sourceBConfig,
      matchingRules
    )

    // Convert exceptions array to keyed map (same pattern as match API)
    const exceptionsMap: Record<string, any> = {}
    for (const exc of result.exceptions) {
      const key = `${exc.source}-${exc.rowIdx}`
      exceptionsMap[key] = {
        category: exc.category,
        reason: exc.reason,
        source: exc.source,
        rowIdx: exc.rowIdx,
      }
    }

    // 7. Save results (status → REVIEW)
    await ReconciliationService.saveMatchResults(run.id, context.organizationId, {
      matchResults: {
        matched: result.matched,
        unmatchedA: result.unmatchedA,
        unmatchedB: result.unmatchedB,
      },
      exceptions: exceptionsMap,
      matchedCount: result.matched.length,
      exceptionCount: result.unmatchedA.length + result.unmatchedB.length,
      variance: result.variance,
    })

    return {
      success: true,
      data: {
        runId: run.id,
        sourceARowCount: loadResult.sourceARowCount,
        sourceBRowCount: loadResult.sourceBRowCount,
        matchedCount: result.matched.length,
        exceptionCount: result.unmatchedA.length + result.unmatchedB.length,
        variance: result.variance,
        periodKey: periodKey || null,
      },
      targetType: "reconciliation_run",
      targetId: run.id,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      targetType: "reconciliation_run",
      targetId: reconciliationConfigId,
    }
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
    return { success: false, error: "Could not find the reconciliation run to complete. The trigger event may not have provided the required data." }
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
    return { success: false, error: "No report definition configured. Please re-create this agent and link it to a task with a report." }
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
    return { success: false, error: "Could not determine the reporting period. Please ensure there is an active board or the trigger provides period information." }
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
    return { success: false, error: "Agent configuration is missing. Please check the automation setup." }
  }

  try {
    // Verify agent exists and belongs to org
    const agent = await prisma.agentDefinition.findFirst({
      where: { id: agentDefinitionId, organizationId: context.organizationId },
    })
    if (!agent) {
      return { success: false, error: "The agent could not be found. It may have been deleted." }
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
