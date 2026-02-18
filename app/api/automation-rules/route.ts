/**
 * Automation Rules API
 *
 * GET    /api/automation-rules — List rules for the organization
 * POST   /api/automation-rules — Create a new automation rule
 * PATCH  /api/automation-rules — Update a rule (body must include `id`)
 * DELETE /api/automation-rules — Deactivate/delete a rule (query param `id`)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { parseExpression } from "cron-parser"
import type { TriggerType, WorkflowDefinition, WorkflowStep } from "@/lib/workflows/types"

const VALID_TRIGGERS: TriggerType[] = [
  "board_created",
  "board_status_changed",
  "scheduled",
  "data_condition",
  "data_uploaded",
  "form_submitted",
  "compound",
  "database_changed",
]

const VALID_STEP_TYPES = ["action", "condition", "human_approval", "agent_run"]
const VALID_ACTION_TYPES = ["send_request", "send_form", "complete_reconciliation", "complete_report"]
const VALID_CONDITION_OPERATORS = ["gt", "lt", "eq", "gte", "lte"]
const VALID_ON_ERROR = ["skip", "fail", "retry"]

/**
 * GET /api/automation-rules
 * List all automation rules for the organization.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  if (!canPerformAction(session.user.role as any, "agents:view" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const rulesRaw = await prisma.automationRule.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { workflowRuns: true },
      },
      lineage: {
        select: { id: true, name: true },
      },
      workflowRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
  })

  // Flatten lastRun from the workflowRuns array
  const rules = rulesRaw.map(({ workflowRuns, ...rest }) => ({
    ...rest,
    lastRun: workflowRuns[0] || null,
  }))

  return NextResponse.json({ rules })
}

/**
 * POST /api/automation-rules
 * Create a new automation rule with validation.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId
  const userId = session.user.id

  if (!canPerformAction(session.user.role as any, "agents:manage" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const body = await request.json()
  const { name, trigger, conditions, actions, lineageId, taskType } = body

  // Validate trigger type
  if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
    return NextResponse.json(
      { error: `Invalid trigger type. Must be one of: ${VALID_TRIGGERS.join(", ")}` },
      { status: 400 }
    )
  }

  // Validate name
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // Validate actions (workflow definition)
  if (!actions?.version || !Array.isArray(actions.steps) || actions.steps.length === 0) {
    return NextResponse.json(
      { error: "Actions must be a workflow definition with version and steps array" },
      { status: 400 }
    )
  }

  // Validate each step in the workflow definition
  const definition = actions as WorkflowDefinition
  const stepErrors = validateStepSchema(definition.steps)
  if (stepErrors.length > 0) {
    return NextResponse.json(
      { error: `Invalid workflow steps: ${stepErrors.join("; ")}` },
      { status: 400 }
    )
  }

  // Validate cron expression for scheduled triggers
  let cronExpression: string | null = null
  let timezone: string | null = null
  let nextRunAt: Date | null = null

  if (trigger === "scheduled") {
    cronExpression = conditions?.cronExpression
    timezone = conditions?.timezone || "UTC"

    if (!cronExpression || typeof cronExpression !== "string") {
      return NextResponse.json({ error: "cronExpression is required for scheduled triggers" }, { status: 400 })
    }

    try {
      const interval = parseExpression(cronExpression, { tz: timezone || undefined })
      nextRunAt = interval.next().toDate()
    } catch (error) {
      return NextResponse.json({ error: `Invalid cron expression: ${cronExpression}` }, { status: 400 })
    }
  }

  // Validate data_condition trigger has required fields
  if (trigger === "data_condition") {
    if (!conditions?.databaseId || !conditions?.columnKey || !conditions?.operator) {
      return NextResponse.json(
        { error: "data_condition trigger requires databaseId, columnKey, and operator in conditions" },
        { status: 400 }
      )
    }
  }

  // Validate compound trigger
  if (trigger === "compound") {
    if (!conditions?.cronExpression || typeof conditions.cronExpression !== "string") {
      return NextResponse.json(
        { error: "compound trigger requires cronExpression in conditions" },
        { status: 400 }
      )
    }

    const tz = conditions.timezone || "UTC"
    try {
      const interval = parseExpression(conditions.cronExpression, { tz: tz as string || undefined })
      cronExpression = conditions.cronExpression
      timezone = tz as string
      nextRunAt = interval.next().toDate()
    } catch {
      return NextResponse.json(
        { error: `Invalid cron expression: ${conditions.cronExpression}` },
        { status: 400 }
      )
    }

    // Validate optional database condition
    if (conditions.databaseCondition) {
      const dc = conditions.databaseCondition as Record<string, unknown>
      if (!dc.databaseId || !dc.columnKey || !dc.operator) {
        return NextResponse.json(
          { error: "databaseCondition requires databaseId, columnKey, and operator" },
          { status: 400 }
        )
      }
    }
  }

  // Validate action permissions at creation time
  const permissionErrors = validateActionPermissions(definition, session.user.role as any, session.user.orgActionPermissions ?? undefined)
  if (permissionErrors.length > 0) {
    return NextResponse.json(
      { error: `Insufficient permissions for actions: ${permissionErrors.join(", ")}` },
      { status: 403 }
    )
  }

  // Validate lineageId if provided
  if (lineageId) {
    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId },
    })
    if (!lineage) {
      return NextResponse.json({ error: "Invalid lineageId" }, { status: 400 })
    }
  }

  const rule = await prisma.automationRule.create({
    data: {
      organizationId,
      name: name.trim(),
      trigger,
      conditions: conditions || {},
      actions,
      cronExpression,
      timezone,
      nextRunAt,
      createdById: userId,
      lineageId: lineageId || null,
      taskType: taskType || null,
    },
  })

  return NextResponse.json({ rule }, { status: 201 })
}

/**
 * PATCH /api/automation-rules
 * Update an existing automation rule. Body must include `id`.
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  if (!canPerformAction(session.user.role as any, "agents:manage" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const body = await request.json()
  const { id, name, isActive, conditions, actions } = body

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  // Verify rule exists and belongs to org
  const existing = await prisma.automationRule.findFirst({
    where: { id, organizationId },
  })
  if (!existing) {
    return NextResponse.json({ error: "Automation rule not found" }, { status: 404 })
  }

  const updateData: Record<string, unknown> = {}

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
    }
    updateData.name = name.trim()
  }

  if (isActive !== undefined) {
    updateData.isActive = Boolean(isActive)
  }

  if (conditions !== undefined) {
    updateData.conditions = conditions || {}

    // Re-validate cron if this is a scheduled or compound trigger and cron changed
    if ((existing.trigger === "scheduled" || existing.trigger === "compound") && conditions?.cronExpression) {
      const tz = conditions.timezone || existing.timezone || "UTC"
      try {
        const interval = parseExpression(conditions.cronExpression, { tz: tz || undefined })
        updateData.cronExpression = conditions.cronExpression
        updateData.timezone = tz
        updateData.nextRunAt = interval.next().toDate()
        // Reset armed state when conditions change
        if (existing.trigger === "compound") {
          updateData.armedAt = null
        }
      } catch (error) {
        return NextResponse.json({ error: `Invalid cron expression: ${conditions.cronExpression}` }, { status: 400 })
      }
    }
  }

  if (actions !== undefined) {
    if (!actions?.version || !Array.isArray(actions.steps) || actions.steps.length === 0) {
      return NextResponse.json(
        { error: "Actions must be a workflow definition with version and steps array" },
        { status: 400 }
      )
    }
    const definition = actions as WorkflowDefinition
    const stepErrors = validateStepSchema(definition.steps)
    if (stepErrors.length > 0) {
      return NextResponse.json(
        { error: `Invalid workflow steps: ${stepErrors.join("; ")}` },
        { status: 400 }
      )
    }
    const permissionErrors = validateActionPermissions(definition, session.user.role as any, session.user.orgActionPermissions ?? undefined)
    if (permissionErrors.length > 0) {
      return NextResponse.json(
        { error: `Insufficient permissions for actions: ${permissionErrors.join(", ")}` },
        { status: 403 }
      )
    }
    updateData.actions = actions
  }

  const rule = await prisma.automationRule.update({
    where: { id },
    data: updateData as any,
  })

  return NextResponse.json({ rule })
}

/**
 * DELETE /api/automation-rules?id=...
 * Deactivate an automation rule. Use ?hard=true to permanently delete (only if no runs).
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  if (!canPerformAction(session.user.role as any, "agents:manage" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const hard = searchParams.get("hard") === "true"

  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 })
  }

  const existing = await prisma.automationRule.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { workflowRuns: true } } },
  })
  if (!existing) {
    return NextResponse.json({ error: "Automation rule not found" }, { status: 404 })
  }

  if (hard) {
    if (existing._count.workflowRuns > 0) {
      return NextResponse.json(
        { error: "Cannot delete rule with existing workflow runs. Deactivate it instead." },
        { status: 400 }
      )
    }
    await prisma.automationRule.delete({ where: { id } })
    return NextResponse.json({ success: true, deleted: true })
  }

  // Soft delete: deactivate
  await prisma.automationRule.update({
    where: { id },
    data: { isActive: false },
  })
  return NextResponse.json({ success: true, deactivated: true })
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Validate the schema of each step in the workflow definition.
 */
function validateStepSchema(steps: WorkflowStep[]): string[] {
  const errors: string[] = []
  const stepIds = new Set<string>()

  for (const step of steps) {
    // Required fields
    if (!step.id || typeof step.id !== "string") {
      errors.push("Each step must have a string id")
      continue
    }
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`)
    }
    stepIds.add(step.id)

    if (!step.label || typeof step.label !== "string") {
      errors.push(`Step "${step.id}": label is required`)
    }

    if (!VALID_STEP_TYPES.includes(step.type)) {
      errors.push(`Step "${step.id}": invalid type "${step.type}". Must be one of: ${VALID_STEP_TYPES.join(", ")}`)
      continue
    }

    // Type-specific validation
    if (step.type === "action") {
      if (!step.actionType || !VALID_ACTION_TYPES.includes(step.actionType)) {
        errors.push(`Step "${step.id}": action step requires actionType (${VALID_ACTION_TYPES.join(", ")})`)
      }
    }

    if (step.type === "condition") {
      if (!step.condition) {
        errors.push(`Step "${step.id}": condition step requires a condition definition`)
      } else {
        if (!step.condition.field || typeof step.condition.field !== "string") {
          errors.push(`Step "${step.id}": condition.field is required`)
        }
        if (!step.condition.operator || !VALID_CONDITION_OPERATORS.includes(step.condition.operator)) {
          errors.push(`Step "${step.id}": condition.operator must be one of: ${VALID_CONDITION_OPERATORS.join(", ")}`)
        }
        if (step.condition.value === undefined) {
          errors.push(`Step "${step.id}": condition.value is required`)
        }
      }
      if (!step.onTrue && !step.onFalse && !step.nextStepId) {
        errors.push(`Step "${step.id}": condition step should specify onTrue, onFalse, or nextStepId for routing`)
      }
    }

    if (step.type === "agent_run") {
      if (!step.agentDefinitionId) {
        errors.push(`Step "${step.id}": agent_run step requires agentDefinitionId`)
      }
    }

    if (step.type === "human_approval") {
      if (!step.notifyUserIds || !Array.isArray(step.notifyUserIds) || step.notifyUserIds.length === 0) {
        errors.push(`Step "${step.id}": human_approval step requires notifyUserIds array`)
      }
    }

    // Validate onError if provided
    if (step.onError && !VALID_ON_ERROR.includes(step.onError)) {
      errors.push(`Step "${step.id}": onError must be one of: ${VALID_ON_ERROR.join(", ")}`)
    }
  }

  // Validate step ID references
  for (const step of steps) {
    if (step.nextStepId && !stepIds.has(step.nextStepId)) {
      errors.push(`Step "${step.id}": nextStepId "${step.nextStepId}" does not reference a valid step`)
    }
    if (step.onTrue && !stepIds.has(step.onTrue)) {
      errors.push(`Step "${step.id}": onTrue "${step.onTrue}" does not reference a valid step`)
    }
    if (step.onFalse && !stepIds.has(step.onFalse)) {
      errors.push(`Step "${step.id}": onFalse "${step.onFalse}" does not reference a valid step`)
    }
  }

  return errors
}

/**
 * Validate that the creating user has permissions for all actions in the workflow.
 */
function validateActionPermissions(
  definition: WorkflowDefinition,
  role: string,
  orgActionPermissions: Record<string, Record<string, boolean>> | undefined
): string[] {
  const errors: string[] = []

  const actionPermissionMap: Record<string, string> = {
    send_request: "inbox:send_emails",
    send_form: "forms:send",
    complete_reconciliation: "reconciliations:resolve",
    complete_report: "reports:generate",
  }

  for (const step of definition.steps) {
    if (step.type === "action" && step.actionType) {
      const requiredPermission = actionPermissionMap[step.actionType]
      if (requiredPermission && !canPerformAction(role as any, requiredPermission as any, orgActionPermissions)) {
        errors.push(`Step "${step.label}" requires ${requiredPermission}`)
      }
    }
  }

  return errors
}
