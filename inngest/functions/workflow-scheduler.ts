/**
 * Workflow Scheduler — Inngest Cron Function
 *
 * Runs every 5 minutes to poll for:
 * 1. Scheduled triggers (cron-based) where nextRunAt <= now
 * 2. Data-condition triggers where database rows match the predicate
 *
 * Uses cron-parser (same as ScheduleExecutionService) for next-run calculation.
 */

import { inngest } from "../client"
import { prisma } from "@/lib/prisma"
import { parseExpression } from "cron-parser"
import {
  createRun,
  buildIdempotencyKey,
} from "@/lib/workflows/workflow-engine.service"
import { evaluateDataCondition } from "@/lib/workflows/trigger-evaluator"
import type {
  TriggerContext,
  ScheduledTriggerConditions,
  DataConditionTriggerConditions,
  CompoundTriggerConditions,
} from "@/lib/workflows/types"

export const workflowScheduler = inngest.createFunction(
  {
    id: "workflow-scheduler",
    name: "Workflow Scheduler",
    throttle: {
      limit: 1,
      period: "3m", // Prevent concurrent runs
    },
  },
  { cron: "*/5 * * * *" }, // Every 5 minutes
  async () => {
    const now = new Date()
    console.log(`[WorkflowScheduler] Starting at ${now.toISOString()}`)

    let scheduledDispatched = 0
    let dataConditionDispatched = 0
    let compoundArmed = 0
    let compoundFiredNoDb = 0
    let compoundSettled = 0
    let errors = 0

    // ── 1. Process scheduled triggers ────────────────────────────────────
    try {
      const dueScheduledRules = await prisma.automationRule.findMany({
        where: {
          trigger: "scheduled",
          isActive: true,
          nextRunAt: { lte: now },
        },
        select: {
          id: true,
          organizationId: true,
          cronExpression: true,
          timezone: true,
          actions: true,
          createdById: true,
        },
      })

      if (dueScheduledRules.length > 0) {
        console.log(`[WorkflowScheduler] Found ${dueScheduledRules.length} due scheduled rule(s)`)
      }

      for (const rule of dueScheduledRules) {
        try {
          const scheduledTime = now.toISOString()
          const idempotencyKey = buildIdempotencyKey(rule.id, "scheduled", scheduledTime)

          const triggerContext: TriggerContext = {
            triggerType: "scheduled",
            triggerEventId: scheduledTime,
            organizationId: rule.organizationId,
            metadata: {
              scheduledTime,
              cronExpression: rule.cronExpression,
              triggeredBy: rule.createdById,
            },
          }

          const run = await createRun({
            automationRuleId: rule.id,
            organizationId: rule.organizationId,
            triggerContext,
            triggeredBy: rule.createdById,
            idempotencyKey,
          })

          if (run) {
            await inngest.send({
              name: "workflow/run",
              data: {
                automationRuleId: rule.id,
                workflowRunId: run.id,
                organizationId: rule.organizationId,
                triggerContext,
              },
            })
            scheduledDispatched++
            console.log(`[WorkflowScheduler] Dispatched scheduled run ${run.id} for rule ${rule.id}`)
          }

          // Calculate and update nextRunAt
          const nextRunAt = calculateNextRun(rule.cronExpression!, rule.timezone || "UTC")
          await prisma.automationRule.update({
            where: { id: rule.id },
            data: { lastRunAt: now, nextRunAt },
          })
        } catch (error: any) {
          console.error(`[WorkflowScheduler] Error processing scheduled rule ${rule.id}:`, error.message)
          errors++
        }
      }
    } catch (error: any) {
      console.error("[WorkflowScheduler] Error querying scheduled rules:", error.message)
      errors++
    }

    // ── 2. Process data-condition triggers ────────────────────────────────
    try {
      const dataConditionRules = await prisma.automationRule.findMany({
        where: {
          trigger: "data_condition",
          isActive: true,
        },
        select: {
          id: true,
          organizationId: true,
          conditions: true,
          actions: true,
          createdById: true,
          lastRunAt: true,
        },
      })

      for (const rule of dataConditionRules) {
        try {
          // Only evaluate at most once every 5 minutes (the cron interval)
          // Additional check: don't re-evaluate if last run was within 4 minutes
          if (rule.lastRunAt && (now.getTime() - rule.lastRunAt.getTime()) < 4 * 60 * 1000) {
            continue
          }

          const conditions = rule.conditions as unknown as DataConditionTriggerConditions
          const evaluation = await evaluateDataCondition(conditions, rule.organizationId)

          if (!evaluation.matched) continue

          // Use periodKey for idempotency to prevent re-firing for the same period
          const eventId = evaluation.periodKey || now.toISOString().split("T")[0]
          const idempotencyKey = buildIdempotencyKey(rule.id, "data_condition", eventId)

          const triggerContext: TriggerContext = {
            triggerType: "data_condition",
            triggerEventId: eventId,
            organizationId: rule.organizationId,
            metadata: {
              databaseId: conditions.databaseId,
              columnKey: conditions.columnKey,
              matchedRowCount: evaluation.matchedRowCount,
              periodKey: evaluation.periodKey,
              triggeredBy: rule.createdById,
            },
          }

          const run = await createRun({
            automationRuleId: rule.id,
            organizationId: rule.organizationId,
            triggerContext,
            triggeredBy: rule.createdById,
            idempotencyKey,
          })

          if (run) {
            await inngest.send({
              name: "workflow/run",
              data: {
                automationRuleId: rule.id,
                workflowRunId: run.id,
                organizationId: rule.organizationId,
                triggerContext,
              },
            })
            dataConditionDispatched++
            console.log(`[WorkflowScheduler] Dispatched data_condition run ${run.id} for rule ${rule.id}`)
          }

          // Update lastRunAt
          await prisma.automationRule.update({
            where: { id: rule.id },
            data: { lastRunAt: now },
          })
        } catch (error: any) {
          console.error(`[WorkflowScheduler] Error processing data_condition rule ${rule.id}:`, error.message)
          errors++
        }
      }
    } catch (error: any) {
      console.error("[WorkflowScheduler] Error querying data_condition rules:", error.message)
      errors++
    }

    // ── 3. Process compound triggers (arm phase) ──────────────────────────
    try {
      const dueCompoundRules = await prisma.automationRule.findMany({
        where: {
          trigger: "compound",
          isActive: true,
          nextRunAt: { lte: now },
          armedAt: null,
        },
        select: {
          id: true,
          organizationId: true,
          cronExpression: true,
          timezone: true,
          conditions: true,
          actions: true,
          createdById: true,
        },
      })

      if (dueCompoundRules.length > 0) {
        console.log(`[WorkflowScheduler] Found ${dueCompoundRules.length} due compound rule(s)`)
      }

      for (const rule of dueCompoundRules) {
        try {
          const conditions = rule.conditions as unknown as CompoundTriggerConditions

          if (!conditions.databaseCondition) {
            // No database condition — fire immediately like a scheduled trigger
            const scheduledTime = now.toISOString()
            const idempotencyKey = buildIdempotencyKey(rule.id, "compound", scheduledTime)

            const triggerContext: TriggerContext = {
              triggerType: "compound",
              triggerEventId: scheduledTime,
              organizationId: rule.organizationId,
              metadata: {
                scheduledTime,
                cronExpression: rule.cronExpression,
                triggeredBy: rule.createdById,
              },
            }

            const run = await createRun({
              automationRuleId: rule.id,
              organizationId: rule.organizationId,
              triggerContext,
              triggeredBy: rule.createdById,
              idempotencyKey,
            })

            if (run) {
              await inngest.send({
                name: "workflow/run",
                data: {
                  automationRuleId: rule.id,
                  workflowRunId: run.id,
                  organizationId: rule.organizationId,
                  triggerContext,
                },
              })
              compoundFiredNoDb++
              console.log(`[WorkflowScheduler] Dispatched compound (no db) run ${run.id} for rule ${rule.id}`)
            }

            const nextRunAt = calculateNextRun(rule.cronExpression!, rule.timezone || "UTC")
            await prisma.automationRule.update({
              where: { id: rule.id },
              data: { lastRunAt: now, nextRunAt },
            })
          } else {
            // Has database condition — arm the trigger, don't fire yet
            const nextRunAt = calculateNextRun(rule.cronExpression!, rule.timezone || "UTC")
            await prisma.automationRule.update({
              where: { id: rule.id },
              data: { armedAt: now, nextRunAt },
            })
            compoundArmed++
            console.log(`[WorkflowScheduler] Armed compound rule ${rule.id}`)
          }
        } catch (error: any) {
          console.error(`[WorkflowScheduler] Error processing compound rule ${rule.id}:`, error.message)
          errors++
        }
      }
    } catch (error: any) {
      console.error("[WorkflowScheduler] Error querying compound rules:", error.message)
      errors++
    }

    // ── 4. Fire settled compound triggers ────────────────────────────────
    // Armed rules where dataSettledAt is set and the settling window has elapsed
    try {
      const settledCandidates = await prisma.automationRule.findMany({
        where: {
          trigger: "compound",
          isActive: true,
          armedAt: { not: null },
          dataSettledAt: { not: null },
        },
        select: {
          id: true,
          organizationId: true,
          conditions: true,
          createdById: true,
          armedAt: true,
          dataSettledAt: true,
        },
      })

      for (const rule of settledCandidates) {
        try {
          const conditions = rule.conditions as unknown as CompoundTriggerConditions
          const settlingMinutes = conditions.settlingMinutes ?? 60
          const elapsedMs = now.getTime() - rule.dataSettledAt!.getTime()

          if (elapsedMs < settlingMinutes * 60 * 1000) {
            // Not settled long enough yet
            continue
          }

          // Re-evaluate the database condition one final time
          const evaluation = await evaluateDataCondition(
            conditions.databaseCondition!,
            rule.organizationId
          )

          if (!evaluation.matched) {
            // Data no longer matches — clear dataSettledAt, stay armed for next data event
            await prisma.automationRule.update({
              where: { id: rule.id },
              data: { dataSettledAt: null },
            })
            console.log(`[WorkflowScheduler] Compound rule ${rule.id} data no longer matches after settling, reset`)
            continue
          }

          // Fire the workflow
          const armedDate = rule.armedAt!
          const periodKey = evaluation.periodKey ||
            `${armedDate.getFullYear()}-${String(armedDate.getMonth() + 1).padStart(2, "0")}`
          const idempotencyKey = buildIdempotencyKey(rule.id, "compound", periodKey)

          const triggerContext: TriggerContext = {
            triggerType: "compound",
            triggerEventId: periodKey,
            organizationId: rule.organizationId,
            metadata: {
              databaseId: conditions.databaseCondition!.databaseId,
              armedAt: armedDate.toISOString(),
              settledAt: rule.dataSettledAt!.toISOString(),
              settlingMinutes,
              matchedRowCount: evaluation.matchedRowCount,
              periodKey,
              triggeredBy: rule.createdById,
            },
          }

          const run = await createRun({
            automationRuleId: rule.id,
            organizationId: rule.organizationId,
            triggerContext,
            triggeredBy: rule.createdById,
            idempotencyKey,
          })

          if (run) {
            await inngest.send({
              name: "workflow/run",
              data: {
                automationRuleId: rule.id,
                workflowRunId: run.id,
                organizationId: rule.organizationId,
                triggerContext,
              },
            })

            // Clear armed + settled state, update lastRunAt
            await prisma.automationRule.update({
              where: { id: rule.id },
              data: { armedAt: null, dataSettledAt: null, lastRunAt: now },
            })

            compoundSettled++
            console.log(`[WorkflowScheduler] Dispatched settled compound run ${run.id} for rule ${rule.id}`)
          }
        } catch (error: any) {
          console.error(`[WorkflowScheduler] Error processing settled compound rule ${rule.id}:`, error.message)
          errors++
        }
      }
    } catch (error: any) {
      console.error("[WorkflowScheduler] Error querying settled compound rules:", error.message)
      errors++
    }

    console.log(
      `[WorkflowScheduler] Done: ${scheduledDispatched} scheduled, ${dataConditionDispatched} data_condition, ` +
      `${compoundArmed} compound armed, ${compoundFiredNoDb} compound fired (no db), ` +
      `${compoundSettled} compound settled, ${errors} errors`
    )

    return {
      success: true,
      scheduledDispatched,
      dataConditionDispatched,
      compoundArmed,
      compoundFiredNoDb,
      compoundSettled,
      errors,
    }
  }
)

/**
 * Calculate the next run time from a cron expression.
 * Reuses the same pattern as ScheduleExecutionService.calculateNextRun.
 */
function calculateNextRun(cronExpression: string, timezone: string): Date {
  try {
    const interval = parseExpression(cronExpression, { tz: timezone })
    return interval.next().toDate()
  } catch (error) {
    console.error(`[WorkflowScheduler] Invalid cron expression: ${cronExpression}`, error)
    // Fallback: 1 day from now
    return new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}
