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

    console.log(`[WorkflowScheduler] Done: ${scheduledDispatched} scheduled, ${dataConditionDispatched} data_condition, ${errors} errors`)

    return {
      success: true,
      scheduledDispatched,
      dataConditionDispatched,
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
