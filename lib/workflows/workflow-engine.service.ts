/**
 * Workflow Engine Service
 *
 * Core orchestration logic for the workflow system.
 * Finds matching rules for trigger events, creates workflow runs
 * with idempotency, and manages run state transitions.
 */

import { prisma } from "@/lib/prisma"
import type {
  TriggerType,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowRunStatus,
  StepResult,
  TriggerContext,
  BoardTriggerConditions,
  DataUploadedTriggerConditions,
  FormSubmittedTriggerConditions,
} from "./types"

// ─── Find Matching Rules ─────────────────────────────────────────────────────

/**
 * Find all active AutomationRules that match a given trigger event.
 * Filters by trigger type and evaluates conditions against metadata.
 */
export async function findMatchingRules(
  triggerType: TriggerType,
  organizationId: string,
  metadata: Record<string, unknown>
): Promise<Array<{ id: string; actions: WorkflowDefinition; conditions: Record<string, unknown> }>> {
  const rules = await prisma.automationRule.findMany({
    where: {
      organizationId,
      trigger: triggerType,
      isActive: true,
    },
    select: {
      id: true,
      actions: true,
      conditions: true,
    },
  })

  // Filter rules whose conditions match the trigger metadata
  return rules.filter((rule) => {
    const conditions = rule.conditions as Record<string, unknown>
    return matchConditions(triggerType, conditions, metadata)
  }) as unknown as Array<{ id: string; actions: WorkflowDefinition; conditions: Record<string, unknown> }>
}

/**
 * Check if a rule's conditions match the trigger event metadata.
 */
function matchConditions(
  triggerType: TriggerType,
  conditions: Record<string, unknown>,
  metadata: Record<string, unknown>
): boolean {
  switch (triggerType) {
    case "board_created":
    case "board_status_changed": {
      const c = conditions as BoardTriggerConditions
      if (c.boardCadence && c.boardCadence !== metadata.cadence) return false
      if (c.targetStatus && c.targetStatus !== metadata.status) return false
      if (c.configId && c.configId !== metadata.configId) return false
      if (c.lineageId && c.lineageId !== metadata.lineageId) return false
      return true
    }
    case "data_uploaded": {
      const c = conditions as DataUploadedTriggerConditions
      if (c.configId && c.configId !== metadata.configId) return false
      return true
    }
    case "form_submitted": {
      const c = conditions as FormSubmittedTriggerConditions
      if (c.formDefinitionId && c.formDefinitionId !== metadata.formDefinitionId) return false
      if (c.taskInstanceId && c.taskInstanceId !== metadata.taskInstanceId) return false
      return true
    }
    // scheduled and data_condition are handled by the scheduler, not the dispatcher
    default:
      return true
  }
}

// ─── Create Workflow Run ─────────────────────────────────────────────────────

interface CreateRunInput {
  automationRuleId: string
  organizationId: string
  triggerContext: TriggerContext
  triggeredBy?: string | null
  idempotencyKey: string
}

/**
 * Create a WorkflowRun with idempotency check.
 * Returns null if a non-terminal run already exists for the key.
 */
export async function createRun(input: CreateRunInput): Promise<{ id: string } | null> {
  const { automationRuleId, organizationId, triggerContext, triggeredBy, idempotencyKey } = input

  // Check idempotency: skip if a non-terminal run exists
  const existing = await prisma.workflowRun.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true },
  })

  if (existing) {
    const terminalStatuses: WorkflowRunStatus[] = ["COMPLETED", "FAILED", "CANCELLED"]
    if (!terminalStatuses.includes(existing.status as WorkflowRunStatus)) {
      console.log(`[WorkflowEngine] Skipping duplicate run: idempotencyKey=${idempotencyKey}, existing run ${existing.id} is ${existing.status}`)
      return null
    }
    // Terminal run exists — allow a new run (e.g., retry after failure)
  }

  try {
    const run = await prisma.workflowRun.create({
      data: {
        automationRuleId,
        organizationId,
        status: "PENDING",
        triggerContext: triggerContext as any,
        idempotencyKey,
        triggeredBy: triggeredBy || null,
      },
      select: { id: true },
    })
    return run
  } catch (error: any) {
    // Handle unique constraint violation (race condition)
    if (error.code === "P2002" && error.meta?.target?.includes("idempotencyKey")) {
      console.log(`[WorkflowEngine] Race condition on idempotency key: ${idempotencyKey}`)
      return null
    }
    throw error
  }
}

// ─── Run State Transitions ───────────────────────────────────────────────────

export async function startRun(runId: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date() },
  })
}

export async function updateRunStep(
  runId: string,
  currentStepId: string,
  stepResult: StepResult
): Promise<void> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: { stepResults: true },
  })

  const existingResults = (run?.stepResults || []) as unknown as StepResult[]
  existingResults.push(stepResult)

  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      currentStepId,
      stepResults: existingResults as any,
    },
  })
}

export async function setWaitingApproval(runId: string, stepId: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "WAITING_APPROVAL", currentStepId: stepId },
  })
}

export async function resumeRun(runId: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "RUNNING" },
  })
}

export async function completeRun(runId: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "COMPLETED", completedAt: new Date() },
  })
}

export async function failRun(runId: string, reason: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "FAILED", failureReason: reason, completedAt: new Date() },
  })
}

export async function cancelRun(runId: string, reason?: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", failureReason: reason || "Cancelled", completedAt: new Date() },
  })
}

// ─── Step Navigation ─────────────────────────────────────────────────────────

/**
 * Get the next step to execute based on current step and workflow definition.
 */
export function getNextStep(
  definition: WorkflowDefinition,
  currentStepId: string | null,
  stepResults: StepResult[]
): WorkflowStep | null {
  const steps = definition.steps
  if (!steps || steps.length === 0) return null

  // If no current step, return the first step
  if (!currentStepId) {
    return steps[0] || null
  }

  const currentStep = steps.find((s) => s.id === currentStepId)
  if (!currentStep) return null

  // For condition steps, route based on evaluation result
  if (currentStep.type === "condition") {
    const lastResult = stepResults.find((r) => r.stepId === currentStepId)
    const conditionResult = lastResult?.data?.conditionResult as boolean | undefined

    const targetStepId = conditionResult ? currentStep.onTrue : currentStep.onFalse
    if (targetStepId) {
      return steps.find((s) => s.id === targetStepId) || null
    }
    // Fall through to nextStepId or sequential
  }

  // Explicit next step
  if (currentStep.nextStepId) {
    return steps.find((s) => s.id === currentStep.nextStepId) || null
  }

  // Sequential: find next by index
  const currentIndex = steps.findIndex((s) => s.id === currentStepId)
  if (currentIndex >= 0 && currentIndex < steps.length - 1) {
    return steps[currentIndex + 1]
  }

  return null // End of workflow
}

/**
 * Evaluate a condition step by looking up a field in step results or trigger context.
 */
export function evaluateCondition(
  condition: { field: string; operator: string; value: unknown },
  stepResults: StepResult[],
  triggerContext: TriggerContext
): boolean {
  const fieldValue = resolveFieldValue(condition.field, stepResults, triggerContext)

  if (fieldValue === undefined || fieldValue === null) return false

  const numVal = Number(fieldValue)
  const numTarget = Number(condition.value)

  switch (condition.operator) {
    case "gt": return numVal > numTarget
    case "lt": return numVal < numTarget
    case "eq": return String(fieldValue) === String(condition.value)
    case "neq": return String(fieldValue) !== String(condition.value)
    case "gte": return numVal >= numTarget
    case "lte": return numVal <= numTarget
    case "contains": return String(fieldValue).includes(String(condition.value))
    default: return false
  }
}

/**
 * Resolve a dot-notation field path against step results and trigger context.
 * Supports: "steps.<stepId>.<field>", "trigger.<field>"
 */
function resolveFieldValue(
  fieldPath: string,
  stepResults: StepResult[],
  triggerContext: TriggerContext
): unknown {
  const parts = fieldPath.split(".")

  if (parts[0] === "steps" && parts.length >= 3) {
    const stepId = parts[1]
    const fieldKey = parts.slice(2).join(".")
    const result = stepResults.find((r) => r.stepId === stepId)
    if (result?.data) {
      return getNestedValue(result.data, fieldKey)
    }
    return undefined
  }

  if (parts[0] === "trigger" && parts.length >= 2) {
    const fieldKey = parts.slice(1).join(".")
    return getNestedValue(triggerContext.metadata, fieldKey)
  }

  return undefined
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ─── Idempotency Key Generation ──────────────────────────────────────────────

export function buildIdempotencyKey(
  ruleId: string,
  triggerType: string,
  eventId: string
): string {
  return `${ruleId}:${triggerType}:${eventId}`
}
