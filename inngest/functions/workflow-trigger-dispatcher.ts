/**
 * Workflow Trigger Dispatcher — Inngest Function
 *
 * Listens for workflow/trigger events (emitted by board service,
 * reconciliation match route, form submit route, etc.) and
 * dispatches matching workflows.
 *
 * Event: "workflow/trigger"
 * Data: { triggerType, triggerEventId, organizationId, metadata }
 */

import { inngest } from "../client"
import { prisma } from "@/lib/prisma"
import {
  findMatchingRules,
  createRun,
  buildIdempotencyKey,
} from "@/lib/workflows/workflow-engine.service"
import { evaluateDataCondition } from "@/lib/workflows/trigger-evaluator"
import { WorkflowAuditService } from "@/lib/workflows/audit.service"
import type {
  TriggerType,
  TriggerContext,
  CompoundTriggerConditions,
} from "@/lib/workflows/types"

export const workflowTriggerDispatcher = inngest.createFunction(
  {
    id: "workflow-trigger-dispatcher",
    name: "Dispatch Workflow Triggers",
  },
  { event: "workflow/trigger" },
  async ({ event }) => {
    const {
      triggerType,
      triggerEventId,
      organizationId,
      metadata,
    } = event.data as {
      triggerType: TriggerType
      triggerEventId: string
      organizationId: string
      metadata: Record<string, unknown>
    }

    console.log(`[WorkflowDispatcher] Received trigger: ${triggerType} event=${triggerEventId} org=${organizationId}`)

    // Find all matching rules
    const matchingRules = await findMatchingRules(triggerType, organizationId, metadata)

    if (matchingRules.length === 0) {
      console.log(`[WorkflowDispatcher] No matching rules for trigger ${triggerType}`)
      return { dispatched: 0 }
    }

    console.log(`[WorkflowDispatcher] Found ${matchingRules.length} matching rule(s)`)

    const triggerContext: TriggerContext = {
      triggerType,
      triggerEventId,
      organizationId,
      metadata,
    }

    let dispatched = 0

    for (const rule of matchingRules) {
      const idempotencyKey = buildIdempotencyKey(rule.id, triggerType, triggerEventId)

      const run = await createRun({
        automationRuleId: rule.id,
        organizationId,
        triggerContext,
        triggeredBy: (metadata.triggeredBy as string) || null,
        idempotencyKey,
      })

      if (!run) {
        console.log(`[WorkflowDispatcher] Skipped duplicate run for rule ${rule.id}`)
        continue
      }

      // Dispatch workflow/run event
      await inngest.send({
        name: "workflow/run",
        data: {
          automationRuleId: rule.id,
          workflowRunId: run.id,
          organizationId,
          triggerContext,
        },
      })

      dispatched++
      console.log(`[WorkflowDispatcher] Dispatched workflow run ${run.id} for rule ${rule.id}`)
    }

    // ── Compound trigger: evaluate armed rules on database_changed events ──
    if (triggerType === "database_changed") {
      const databaseId = metadata.databaseId as string
      if (databaseId) {
        try {
          const armedCompoundRules = await prisma.automationRule.findMany({
            where: {
              trigger: "compound",
              isActive: true,
              organizationId,
              armedAt: { not: null },
            },
            select: {
              id: true,
              organizationId: true,
              conditions: true,
              createdById: true,
              armedAt: true,
            },
          })

          for (const rule of armedCompoundRules) {
            const conditions = rule.conditions as unknown as CompoundTriggerConditions
            // Only process rules targeting this specific database
            if (conditions.databaseCondition?.databaseId !== databaseId) continue

            // Evaluate the database condition
            const evaluation = await evaluateDataCondition(
              conditions.databaseCondition,
              organizationId
            )

            if (!evaluation.matched) {
              console.log(`[WorkflowDispatcher] Compound rule ${rule.id} data condition not met`)
              continue
            }

            const settlingMinutes = conditions.settlingMinutes ?? 60

            if (settlingMinutes > 0) {
              // Settling window active: record/update when data last changed.
              // The scheduler will fire once the settling window elapses with no new data.
              await prisma.automationRule.update({
                where: { id: rule.id },
                data: { dataSettledAt: new Date() },
              })
              console.log(`[WorkflowDispatcher] Compound rule ${rule.id} data matched, settling window ${settlingMinutes}min (updated dataSettledAt)`)
              continue
            }

            // No settling window — fire immediately
            const armedDate = rule.armedAt!
            const periodKey = evaluation.periodKey ||
              `${armedDate.getFullYear()}-${String(armedDate.getMonth() + 1).padStart(2, "0")}`
            const compoundIdempotencyKey = buildIdempotencyKey(rule.id, "compound", periodKey)

            const compoundTriggerContext: TriggerContext = {
              triggerType: "compound",
              triggerEventId: periodKey,
              organizationId,
              metadata: {
                databaseId,
                armedAt: armedDate.toISOString(),
                matchedRowCount: evaluation.matchedRowCount,
                periodKey,
                triggeredBy: rule.createdById,
              },
            }

            const compoundRun = await createRun({
              automationRuleId: rule.id,
              organizationId,
              triggerContext: compoundTriggerContext,
              triggeredBy: rule.createdById,
              idempotencyKey: compoundIdempotencyKey,
            })

            if (compoundRun) {
              await inngest.send({
                name: "workflow/run",
                data: {
                  automationRuleId: rule.id,
                  workflowRunId: compoundRun.id,
                  organizationId,
                  triggerContext: compoundTriggerContext,
                },
              })

              // Clear armed state and update lastRunAt
              await prisma.automationRule.update({
                where: { id: rule.id },
                data: { armedAt: null, dataSettledAt: null, lastRunAt: new Date() },
              })

              dispatched++
              console.log(`[WorkflowDispatcher] Dispatched compound run ${compoundRun.id} for rule ${rule.id}`)
            }
          }
        } catch (error: any) {
          console.error("[WorkflowDispatcher] Error processing compound triggers:", error.message)
        }
      }
    }

    return { dispatched, rulesMatched: matchingRules.length }
  }
)
