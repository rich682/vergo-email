/**
 * Memory Formatter
 *
 * Formats retrieved memories into LLM-ready prompt strings.
 * Includes few-shot examples from highest-confidence memories.
 */

import type { RetrievedMemory } from "../types"

/**
 * Format memories for injection into the agent system prompt.
 */
export function formatMemoriesForPrompt(memories: RetrievedMemory[]): string {
  if (memories.length === 0) {
    return "No prior memories. This is your first time working with this data."
  }

  const sections: string[] = []

  // Split by scope
  const entityMemories = memories.filter(m => m.scope === "entity")
  const patternMemories = memories.filter(m => m.scope === "pattern")

  if (entityMemories.length > 0) {
    sections.push("## Entity Knowledge")
    for (const m of entityMemories) {
      const conf = `${Math.round(m.confidence * 100)}% (${m.correctCount}/${m.totalCount})`
      sections.push(
        `- ${m.entityKey || "Unknown"} [${m.category || "general"}]: ${m.content.description} (confidence: ${conf}, used ${m.usageCount}x)`
      )
    }
  }

  if (patternMemories.length > 0) {
    sections.push("\n## Learned Patterns")
    for (const m of patternMemories) {
      const conf = `${Math.round(m.confidence * 100)}% (${m.correctCount}/${m.totalCount})`
      const conditions = m.conditions
        ? ` | Applies when: ${formatConditions(m.conditions as Record<string, unknown>)}`
        : ""
      sections.push(
        `- [${m.category || "general"}]: ${m.content.description} (confidence: ${conf})${conditions}`
      )
    }
  }

  // Add few-shot examples from top 3 highest-confidence memories
  const topMemories = [...memories]
    .sort((a, b) => b.confidence - a.confidence)
    .filter(m => m.confidence >= 0.8 && m.content.evidence?.length)
    .slice(0, 3)

  if (topMemories.length > 0) {
    sections.push("\n## Examples from Past Runs")
    for (const m of topMemories) {
      const evidence = m.content.evidence?.[0] || ""
      if (evidence) {
        sections.push(`Example: "${evidence}"`)
      }
    }
  }

  return sections.join("\n")
}

function formatConditions(conditions: Record<string, unknown>): string {
  const parts: string[] = []
  if (conditions.vendor) parts.push(`vendor="${conditions.vendor}"`)
  if (conditions.amountRange) {
    const [min, max] = conditions.amountRange as [number, number]
    parts.push(`amount $${min}-$${max}`)
  }
  if (conditions.descContains) parts.push(`description contains "${conditions.descContains}"`)
  return parts.join(", ") || "general"
}
