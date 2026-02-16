/**
 * Memory Writer
 *
 * Upserts agent memories with Bayesian confidence tracking.
 * Uses correct_count / total_count instead of arbitrary percentages.
 */

import { prisma } from "@/lib/prisma"
import type { MemoryScope, MemoryContent, MemoryConditions } from "../types"

interface WriteMemoryInput {
  organizationId: string
  agentDefinitionId: string
  scope: MemoryScope
  entityKey?: string
  category?: string
  content: MemoryContent
  conditions?: MemoryConditions
  isCorrection?: boolean // If true, this is from a human correction
}

/**
 * Create or update a memory entry.
 *
 * If a memory with the same scope + entityKey + category exists:
 * - Update content
 * - Increment totalCount (and correctCount if not a correction)
 * - Recalculate confidence
 *
 * If new:
 * - Create with Beta(1,1) prior → confidence 0.5
 */
export async function upsertMemory(input: WriteMemoryInput): Promise<string> {
  const {
    organizationId,
    agentDefinitionId,
    scope,
    entityKey,
    category,
    content,
    conditions,
    isCorrection = false,
  } = input

  // Try to find existing memory
  const existing = await prisma.agentMemory.findFirst({
    where: {
      organizationId,
      agentDefinitionId,
      scope,
      entityKey: entityKey || null,
      category: category || null,
      isArchived: false,
    },
  })

  if (existing) {
    // Update existing memory
    const newTotalCount = existing.totalCount + 1
    const newCorrectCount = isCorrection
      ? existing.correctCount // Correction = agent was wrong, don't increment correct
      : existing.correctCount + 1 // Confirmation = agent was right
    const newConfidence = newCorrectCount / newTotalCount

    const updated = await prisma.agentMemory.update({
      where: { id: existing.id },
      data: {
        content: content as any,
        conditions: conditions as any || existing.conditions,
        correctCount: newCorrectCount,
        totalCount: newTotalCount,
        confidence: newConfidence,
        lastUsedAt: new Date(),
      },
    })

    return updated.id
  }

  // Create new memory with Beta(1,1) prior
  const created = await prisma.agentMemory.create({
    data: {
      organizationId,
      agentDefinitionId,
      scope,
      entityKey: entityKey || null,
      category: category || null,
      content: content as any,
      conditions: conditions as any || null,
      confidence: 0.5,  // Beta(1,1) prior
      correctCount: 1,
      totalCount: 2,
      usageCount: 0,
    },
  })

  return created.id
}

/**
 * Reinforce a memory (agent recommendation was confirmed by human).
 */
export async function reinforceMemory(memoryId: string): Promise<void> {
  const memory = await prisma.agentMemory.findUnique({ where: { id: memoryId } })
  if (!memory) return

  const newTotalCount = memory.totalCount + 1
  const newCorrectCount = memory.correctCount + 1

  await prisma.agentMemory.update({
    where: { id: memoryId },
    data: {
      correctCount: newCorrectCount,
      totalCount: newTotalCount,
      confidence: newCorrectCount / newTotalCount,
      lastUsedAt: new Date(),
    },
  })
}

/**
 * Weaken a memory (agent recommendation was corrected by human).
 */
export async function weakenMemory(memoryId: string): Promise<void> {
  const memory = await prisma.agentMemory.findUnique({ where: { id: memoryId } })
  if (!memory) return

  const newTotalCount = memory.totalCount + 1
  // correctCount stays the same — agent was wrong

  await prisma.agentMemory.update({
    where: { id: memoryId },
    data: {
      totalCount: newTotalCount,
      confidence: memory.correctCount / newTotalCount,
      lastUsedAt: new Date(),
    },
  })
}

/**
 * Archive a memory (soft delete).
 */
export async function archiveMemory(memoryId: string): Promise<void> {
  await prisma.agentMemory.update({
    where: { id: memoryId },
    data: { isArchived: true },
  })
}
