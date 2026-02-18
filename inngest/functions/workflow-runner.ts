/**
 * Workflow Runner — Inngest Function
 *
 * Executes a workflow by walking through its step array.
 * Uses step.run() for durability — crash-resumable.
 * Uses step.waitForEvent() for human approval gates.
 *
 * Event: "workflow/run"
 * Data: { automationRuleId, workflowRunId, organizationId, triggerContext }
 */

import { inngest } from "../client"
import { prisma } from "@/lib/prisma"
import {
  startRun,
  updateRunStep,
  setWaitingApproval,
  resumeRun,
  completeRun,
  failRun,
  cancelRun,
  getNextStep,
  evaluateCondition,
} from "@/lib/workflows/workflow-engine.service"
import { executeAction, handleAgentRun } from "@/lib/workflows/action-handlers"
import { WorkflowAuditService } from "@/lib/workflows/audit.service"
import { NotificationService } from "@/lib/services/notification.service"
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  TriggerContext,
  ActionContext,
} from "@/lib/workflows/types"

export const workflowRunner = inngest.createFunction(
  {
    id: "workflow-run",
    name: "Run Workflow",
    retries: 2,
  },
  { event: "workflow/run" },
  async ({ event, step }) => {
    const {
      automationRuleId,
      workflowRunId,
      organizationId,
      triggerContext,
    } = event.data as {
      automationRuleId: string
      workflowRunId: string
      organizationId: string
      triggerContext: TriggerContext
    }

    // ── Step 1: Load rule definition ────────────────────────────────────
    const rule = await step.run("load-rule", async () => {
      const r = await prisma.automationRule.findFirst({
        where: { id: automationRuleId, organizationId },
        select: { id: true, actions: true, createdById: true, lineageId: true },
      })
      if (!r) throw new Error(`AutomationRule ${automationRuleId} not found`)
      return r
    })

    const definition = rule.actions as unknown as WorkflowDefinition
    if (!definition?.steps || definition.steps.length === 0) {
      await failRun(workflowRunId, "Workflow has no steps")
      return { workflowRunId, status: "FAILED", reason: "No steps" }
    }

    // ── Step 2: Start run ───────────────────────────────────────────────
    await step.run("start-run", async () => {
      await startRun(workflowRunId)
      await WorkflowAuditService.log({
        workflowRunId,
        organizationId,
        actionType: "workflow_started",
        outcome: "success",
        detail: { triggerType: triggerContext.triggerType, stepsCount: definition.steps.length },
      })
    })

    // ── Step 3: Walk through steps ──────────────────────────────────────
    const stepResults: StepResult[] = []
    let currentStep: WorkflowStep | null = definition.steps[0]

    while (currentStep) {
      const stepId = currentStep.id
      const stepLabel = currentStep.label

      try {
        const result = await step.run(`step-${stepId}`, async () => {
          return executeWorkflowStep(currentStep!, {
            organizationId,
            workflowRunId,
            triggeredBy: rule.createdById || triggerContext.metadata.triggeredBy as string || null,
            triggerContext,
            stepResults,
            lineageId: rule.lineageId,
          })
        })

        // Handle human approval step — pause and wait
        if (result.type === "wait_for_approval") {
          await step.run(`approval-setup-${stepId}`, async () => {
            await setWaitingApproval(workflowRunId, stepId)
            await WorkflowAuditService.log({
              workflowRunId,
              organizationId,
              stepId,
              actionType: "approval_requested",
              detail: { message: currentStep!.approvalMessage, notifyUserIds: currentStep!.notifyUserIds },
            })

            // Notify designated users about pending approval
            const notifyUserIds = currentStep!.notifyUserIds
            if (notifyUserIds && notifyUserIds.length > 0) {
              await NotificationService.createMany(
                notifyUserIds.map((userId) => ({
                  userId,
                  organizationId,
                  type: "workflow_approval" as const,
                  title: "Workflow approval required",
                  body: currentStep!.approvalMessage || `Step "${stepLabel}" requires your approval.`,
                  metadata: { workflowRunId, stepId, stepLabel },
                }))
              )
            }
          })

          // Wait for approval event
          const timeoutHours = currentStep.timeoutHours || 72
          const approvalEvent = await step.waitForEvent(`wait-approval-${stepId}`, {
            event: "workflow/approved",
            match: "data.workflowRunId",
            timeout: `${timeoutHours}h`,
          })

          if (!approvalEvent) {
            // Timeout — cancel workflow
            await step.run(`timeout-${stepId}`, async () => {
              const timeoutResult: StepResult = {
                stepId,
                stepLabel,
                type: "human_approval",
                outcome: "failed",
                error: `Approval timed out after ${timeoutHours} hours`,
                completedAt: new Date().toISOString(),
              }
              stepResults.push(timeoutResult)
              await updateRunStep(workflowRunId, stepId, timeoutResult)
              await cancelRun(workflowRunId, `Approval timeout on step "${stepLabel}"`)
              await WorkflowAuditService.log({
                workflowRunId,
                organizationId,
                stepId,
                actionType: "approval_timeout",
                outcome: "failed",
                detail: { timeoutHours },
              })
            })
            return { workflowRunId, status: "CANCELLED", reason: "Approval timeout" }
          }

          // Process approval decision
          const decision = approvalEvent.data.decision as "approved" | "rejected"
          const approvedBy = approvalEvent.data.approvedBy as string

          if (decision === "rejected") {
            await step.run(`rejected-${stepId}`, async () => {
              const rejectResult: StepResult = {
                stepId,
                stepLabel,
                type: "human_approval",
                outcome: "failed",
                error: "Rejected by user",
                data: { approvedBy, decision },
                completedAt: new Date().toISOString(),
              }
              stepResults.push(rejectResult)
              await updateRunStep(workflowRunId, stepId, rejectResult)
              await cancelRun(workflowRunId, `Rejected by ${approvedBy} at step "${stepLabel}"`)
              await WorkflowAuditService.log({
                workflowRunId,
                organizationId,
                stepId,
                actionType: "approval_rejected",
                outcome: "failed",
                actorType: "human",
                actorId: approvedBy,
              })
            })
            return { workflowRunId, status: "CANCELLED", reason: "Rejected" }
          }

          // Approved — continue
          await step.run(`approved-${stepId}`, async () => {
            const approveResult: StepResult = {
              stepId,
              stepLabel,
              type: "human_approval",
              outcome: "success",
              data: { approvedBy, decision },
              completedAt: new Date().toISOString(),
            }
            stepResults.push(approveResult)
            await updateRunStep(workflowRunId, stepId, approveResult)
            await resumeRun(workflowRunId)
            await WorkflowAuditService.log({
              workflowRunId,
              organizationId,
              stepId,
              actionType: "approval_granted",
              outcome: "success",
              actorType: "human",
              actorId: approvedBy,
            })
          })
        } else {
          // Normal step result
          stepResults.push(result.stepResult)
          await step.run(`persist-${stepId}`, async () => {
            await updateRunStep(workflowRunId, stepId, result.stepResult)
          })

          // Handle step failure
          if (result.stepResult.outcome === "failed") {
            const onError = currentStep!.onError || "fail"
            if (onError === "fail") {
              await step.run(`fail-workflow-${stepId}`, async () => {
                await failRun(workflowRunId, result.stepResult.error || `Step "${stepLabel}" failed`)
                await WorkflowAuditService.log({
                  workflowRunId,
                  organizationId,
                  stepId,
                  actionType: "workflow_failed",
                  outcome: "failed",
                  detail: { error: result.stepResult.error },
                })
              })
              return { workflowRunId, status: "FAILED", reason: result.stepResult.error }
            }
            // onError === "skip" — continue to next step
          }
        }
      } catch (error: any) {
        // Unexpected error — fail the run
        await step.run(`error-${stepId}`, async () => {
          const errorResult: StepResult = {
            stepId,
            stepLabel,
            type: currentStep!.type,
            outcome: "failed",
            error: error.message,
            completedAt: new Date().toISOString(),
          }
          stepResults.push(errorResult)
          await updateRunStep(workflowRunId, stepId, errorResult)
          await failRun(workflowRunId, error.message)
          await WorkflowAuditService.log({
            workflowRunId,
            organizationId,
            stepId,
            actionType: "step_failed",
            outcome: "failed",
            detail: { error: error.message },
          })
        })
        return { workflowRunId, status: "FAILED", reason: error.message }
      }

      // Navigate to next step
      currentStep = getNextStep(definition, stepId, stepResults)
    }

    // ── Step 4: Complete run ────────────────────────────────────────────
    await step.run("complete-run", async () => {
      await completeRun(workflowRunId)
      await WorkflowAuditService.log({
        workflowRunId,
        organizationId,
        actionType: "workflow_completed",
        outcome: "success",
        detail: { stepsExecuted: stepResults.length },
      })
    })

    return { workflowRunId, status: "COMPLETED", stepsExecuted: stepResults.length }
  }
)

// ─── Step Execution ──────────────────────────────────────────────────────────

interface StepExecutionResult {
  type: "result" | "wait_for_approval"
  stepResult: StepResult
}

async function executeWorkflowStep(
  step: WorkflowStep,
  context: {
    organizationId: string
    workflowRunId: string
    triggeredBy: string | null
    triggerContext: TriggerContext
    stepResults: StepResult[]
    lineageId?: string | null
  }
): Promise<StepExecutionResult> {
  const actionContext: ActionContext = {
    organizationId: context.organizationId,
    workflowRunId: context.workflowRunId,
    triggeredBy: context.triggeredBy,
    triggerContext: context.triggerContext,
    stepResults: context.stepResults,
    lineageId: context.lineageId,
  }

  switch (step.type) {
    case "action": {
      if (!step.actionType) {
        return {
          type: "result",
          stepResult: {
            stepId: step.id,
            stepLabel: step.label,
            type: "action",
            outcome: "failed",
            error: "Missing actionType",
            completedAt: new Date().toISOString(),
          },
        }
      }

      const result = await executeAction(step.actionType, step.actionParams || {}, actionContext)

      await WorkflowAuditService.log({
        workflowRunId: context.workflowRunId,
        organizationId: context.organizationId,
        stepId: step.id,
        actionType: "action_executed",
        targetType: result.targetType as any,
        targetId: result.targetId,
        outcome: result.success ? "success" : "failed",
        detail: result.data || (result.error ? { error: result.error } : undefined),
      })

      return {
        type: "result",
        stepResult: {
          stepId: step.id,
          stepLabel: step.label,
          type: "action",
          outcome: result.success ? "success" : "failed",
          data: result.data,
          error: result.error,
          completedAt: new Date().toISOString(),
        },
      }
    }

    case "agent_run": {
      if (!step.agentDefinitionId) {
        return {
          type: "result",
          stepResult: {
            stepId: step.id,
            stepLabel: step.label,
            type: "agent_run",
            outcome: "failed",
            error: "Missing agentDefinitionId",
            completedAt: new Date().toISOString(),
          },
        }
      }

      const result = await handleAgentRun(step.agentDefinitionId, actionContext)

      await WorkflowAuditService.log({
        workflowRunId: context.workflowRunId,
        organizationId: context.organizationId,
        stepId: step.id,
        actionType: "action_executed",
        targetType: "agent_execution",
        targetId: step.agentDefinitionId,
        outcome: result.success ? "success" : "failed",
        detail: result.data,
      })

      return {
        type: "result",
        stepResult: {
          stepId: step.id,
          stepLabel: step.label,
          type: "agent_run",
          outcome: result.success ? "success" : "failed",
          data: result.data,
          error: result.error,
          completedAt: new Date().toISOString(),
        },
      }
    }

    case "condition": {
      if (!step.condition) {
        return {
          type: "result",
          stepResult: {
            stepId: step.id,
            stepLabel: step.label,
            type: "condition",
            outcome: "failed",
            error: "Missing condition definition",
            completedAt: new Date().toISOString(),
          },
        }
      }

      const conditionResult = evaluateCondition(
        step.condition,
        context.stepResults,
        context.triggerContext
      )

      await WorkflowAuditService.log({
        workflowRunId: context.workflowRunId,
        organizationId: context.organizationId,
        stepId: step.id,
        actionType: "condition_evaluated",
        outcome: "success",
        detail: {
          field: step.condition.field,
          operator: step.condition.operator,
          value: step.condition.value,
          result: conditionResult,
          branchTaken: conditionResult ? "onTrue" : "onFalse",
        },
      })

      return {
        type: "result",
        stepResult: {
          stepId: step.id,
          stepLabel: step.label,
          type: "condition",
          outcome: "success",
          data: { conditionResult },
          completedAt: new Date().toISOString(),
        },
      }
    }

    case "human_approval": {
      // Signal that we need to wait for approval
      // The caller handles the waitForEvent pattern
      return {
        type: "wait_for_approval",
        stepResult: {
          stepId: step.id,
          stepLabel: step.label,
          type: "human_approval",
          outcome: "success",
          data: { waiting: true },
          completedAt: new Date().toISOString(),
        },
      }
    }

    default:
      return {
        type: "result",
        stepResult: {
          stepId: step.id,
          stepLabel: step.label,
          type: step.type,
          outcome: "failed",
          error: `Unknown step type: ${step.type}`,
          completedAt: new Date().toISOString(),
        },
      }
  }
}
