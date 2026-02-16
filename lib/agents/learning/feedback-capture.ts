/**
 * Feedback Capture
 *
 * Post-completion comparison of agent recommendations vs human actions.
 * Triggered when a ReconciliationRun is marked COMPLETE.
 */

import { prisma } from "@/lib/prisma"
import { updateConfidence } from "./confidence-updater"
import { upsertMemory } from "../memory/memory-writer"

/**
 * Process feedback from a completed reconciliation run.
 * Compares agent recommendations with human resolutions.
 */
export async function processRunFeedback(
  executionId: string,
  organizationId: string,
  reconciliationRunId: string
): Promise<{ approved: number; corrected: number; newMemories: number }> {
  // Get the execution with its outcome (which contains recommendations)
  const execution = await prisma.agentExecution.findUnique({
    where: { id: executionId },
    select: {
      agentDefinitionId: true,
      outcome: true,
    },
  })

  if (!execution || !execution.outcome) {
    return { approved: 0, corrected: 0, newMemories: 0 }
  }

  const outcome = execution.outcome as { recommendations?: Array<{
    exceptionIndex: number
    category: string
    confidence: number
    basedOnMemoryId?: string
  }> }

  const recommendations = outcome.recommendations || []
  if (recommendations.length === 0) {
    return { approved: 0, corrected: 0, newMemories: 0 }
  }

  // Get the final exceptions from the reconciliation run
  const run = await prisma.reconciliationRun.findUnique({
    where: { id: reconciliationRunId },
    select: { exceptions: true },
  })

  const exceptions = (run?.exceptions || {}) as Record<string, {
    category?: string
    resolution?: string
    resolvedBy?: string
  }>

  let approved = 0
  let corrected = 0
  let newMemories = 0

  for (const rec of recommendations) {
    const exceptionKey = String(rec.exceptionIndex)
    const humanResolution = exceptions[exceptionKey]

    if (!humanResolution || !humanResolution.resolvedBy) continue

    const wasCorrect = humanResolution.category === rec.category

    // Update memory confidence if recommendation was based on a memory
    if (rec.basedOnMemoryId) {
      await updateConfidence(rec.basedOnMemoryId, wasCorrect)
    }

    // Record feedback
    await prisma.agentFeedback.create({
      data: {
        organizationId,
        executionId,
        feedbackType: wasCorrect ? "approval" : "correction",
        originalValue: { category: rec.category, confidence: rec.confidence },
        correctedValue: wasCorrect ? undefined : { category: humanResolution.category || "unknown" },
        correctedBy: humanResolution.resolvedBy,
      },
    })

    if (wasCorrect) {
      approved++
    } else {
      corrected++

      // Create a correction memory so the agent learns from the mistake
      if (humanResolution.category) {
        await upsertMemory({
          organizationId,
          agentDefinitionId: execution.agentDefinitionId,
          scope: "pattern",
          category: humanResolution.category,
          content: {
            description: `Exception index ${rec.exceptionIndex} was ${humanResolution.category}, not ${rec.category}`,
            lastConfirmed: new Date().toISOString(),
          },
          isCorrection: true,
        })
        newMemories++
      }
    }
  }

  return { approved, corrected, newMemories }
}
