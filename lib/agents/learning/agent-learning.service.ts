/**
 * Agent Learning Service
 *
 * Post-execution lesson distillation.
 * Extracts patterns from execution results and upserts memories.
 */

import { callAgentLLM } from "../llm-client"
import { upsertMemory } from "../memory/memory-writer"
import type { ExecutionStep, AgentRecommendation, LearningLesson } from "../types"

/**
 * Distill lessons from a completed execution.
 * Called after the agent finishes — extracts patterns to remember.
 */
export async function distillLessons(
  organizationId: string,
  agentDefinitionId: string,
  steps: ExecutionStep[],
  recommendations: AgentRecommendation[]
): Promise<{ lessonsCreated: number; lessonsUpdated: number }> {
  let created = 0
  let updated = 0

  // Extract entity observations from tool calls
  for (const step of steps) {
    if (step.toolName === "check_vendor_database" && step.status === "completed" && step.toolOutput) {
      const output = step.toolOutput as { data?: { matches?: Array<{ name?: string; category?: string }> } }
      const matches = output.data?.matches || []
      for (const match of matches) {
        if (match.name) {
          await upsertMemory({
            organizationId,
            agentDefinitionId,
            scope: "entity",
            entityKey: match.name,
            category: match.category || "vendor_info",
            content: {
              description: `Vendor found in database: ${match.name}${match.category ? ` (${match.category})` : ""}`,
              lastConfirmed: new Date().toISOString(),
            },
          })
          created++
        }
      }
    }
  }

  // Extract pattern observations from recommendations
  for (const rec of recommendations) {
    if (rec.confidence >= 0.8 && rec.basedOnMemoryId) {
      // High-confidence recommendation based on memory — reinforce will happen in feedback
      continue
    }

    // New pattern observation from this run
    if (rec.confidence >= 0.6) {
      await upsertMemory({
        organizationId,
        agentDefinitionId,
        scope: "pattern",
        category: rec.category,
        content: {
          description: rec.reason,
          firstObserved: new Date().toISOString(),
        },
      })
      created++
    }
  }

  return { lessonsCreated: created, lessonsUpdated: updated }
}
