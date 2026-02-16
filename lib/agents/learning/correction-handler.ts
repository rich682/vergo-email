/**
 * Correction Handler
 *
 * Bridges the gap between individual human corrections (from the feedback API)
 * and the memory system. When a user submits a correction:
 * 1. Updates existing memory confidence (reinforce or weaken)
 * 2. Creates new correction memories when the agent had no prior knowledge
 * 3. Increments humanCorrections metric for tracking
 */

import { prisma } from "@/lib/prisma"
import { weakenMemory, reinforceMemory, upsertMemory } from "../memory/memory-writer"
import type { MemoryScope } from "../types"

interface CorrectionInput {
  executionId: string
  organizationId: string
  agentDefinitionId: string
  feedbackType: "correction" | "approval" | "rejection"
  originalValue: {
    category?: string
    confidence?: number
    basedOnMemoryId?: string
    basedOnMemoryType?: string
    exceptionIndex?: number
  }
  correctedValue?: {
    category?: string
    reason?: string
    vendor?: string
  }
  correctedBy: string
}

interface CorrectionResult {
  memoryUpdated: boolean
  memoryCreated: boolean
  memoryId: string | null
}

/**
 * Build a human-readable description from the correction context.
 */
function buildDescription(
  original: CorrectionInput["originalValue"],
  corrected: CorrectionInput["correctedValue"]
): string {
  const parts: string[] = []
  if (original.category && corrected?.category && original.category !== corrected.category) {
    parts.push(`Corrected from "${original.category}" to "${corrected.category}"`)
  } else if (corrected?.category) {
    parts.push(`Human classified as "${corrected.category}"`)
  }
  if (corrected?.reason) {
    parts.push(corrected.reason)
  }
  return parts.join(". ") || "Human correction applied"
}

/**
 * Process an individual human correction into memory updates.
 *
 * - If the agent's recommendation was based on an existing memory:
 *   reinforce (approval) or weaken (correction) that memory.
 * - If the correction introduces new knowledge (no existing memory):
 *   create a new memory from the correction.
 * - Always increments the humanCorrections metric for the execution.
 */
export async function handleCorrection(input: CorrectionInput): Promise<CorrectionResult> {
  const {
    executionId,
    organizationId,
    agentDefinitionId,
    feedbackType,
    originalValue,
    correctedValue,
  } = input

  const wasCorrect = feedbackType === "approval"
  let memoryUpdated = false
  let memoryCreated = false
  let memoryId: string | null = null

  // ── Step 1: Update existing memory if referenced ──────────────────
  if (originalValue.basedOnMemoryId) {
    if (wasCorrect) {
      await reinforceMemory(originalValue.basedOnMemoryId)
      memoryUpdated = true
      memoryId = originalValue.basedOnMemoryId
    } else {
      await weakenMemory(originalValue.basedOnMemoryId)
      memoryUpdated = true
      // Fall through to step 2 — also create a correction memory
    }
  }

  // ── Step 2: Create correction memory for new knowledge ────────────
  if (feedbackType === "correction" && correctedValue?.category) {
    const entityKey = correctedValue.vendor || undefined
    const scope: MemoryScope = entityKey ? "entity" : "pattern"
    const description = buildDescription(originalValue, correctedValue)

    const newMemoryId = await upsertMemory({
      organizationId,
      agentDefinitionId,
      scope,
      entityKey,
      category: correctedValue.category,
      content: {
        description,
        lastConfirmed: new Date().toISOString(),
      },
      isCorrection: true,
    })

    memoryCreated = true
    memoryId = newMemoryId
  }

  // ── Step 3: Increment humanCorrections metric ─────────────────────
  await prisma.agentExecutionMetrics.updateMany({
    where: { executionId },
    data: { humanCorrections: { increment: 1 } },
  })

  // If approval with no memory reference, nothing to update
  return { memoryUpdated, memoryCreated, memoryId }
}
