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
import {
  findMatchingRules,
  createRun,
  buildIdempotencyKey,
} from "@/lib/workflows/workflow-engine.service"
import { WorkflowAuditService } from "@/lib/workflows/audit.service"
import type { TriggerType, TriggerContext } from "@/lib/workflows/types"

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

    return { dispatched, rulesMatched: matchingRules.length }
  }
)
