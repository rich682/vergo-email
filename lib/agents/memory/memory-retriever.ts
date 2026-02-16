/**
 * Memory Retriever
 *
 * Scoped, relevance-weighted, token-budgeted memory retrieval.
 * Returns formatted memories ready for LLM injection.
 */

import { prisma } from "@/lib/prisma"
import type { RetrievedMemory, MemoryContent, MemoryConditions } from "../types"

interface RetrievalOptions {
  organizationId: string
  agentDefinitionId: string
  entityKeys?: string[]       // Vendor names / account numbers to match
  maxMemories?: number        // Default 20
  confidenceFloor?: number    // Default 0.5
}

/**
 * Retrieve relevant memories for the current execution context.
 */
export async function retrieveMemories(options: RetrievalOptions): Promise<RetrievedMemory[]> {
  const {
    organizationId,
    agentDefinitionId,
    entityKeys = [],
    maxMemories = 20,
    confidenceFloor = 0.5,
  } = options

  // Fetch all non-archived memories above confidence floor
  const rawMemories = await prisma.agentMemory.findMany({
    where: {
      organizationId,
      agentDefinitionId,
      isArchived: false,
      confidence: { gte: confidenceFloor },
    },
    orderBy: { confidence: "desc" },
    take: 100, // Fetch more than needed to allow scoring
  })

  // Score and rank memories
  const now = Date.now()
  const scored: RetrievedMemory[] = rawMemories.map(m => {
    const content = m.content as unknown as MemoryContent
    const conditions = m.conditions as unknown as MemoryConditions | null

    // Recency weighting: decay by 0.9^(months since last use)
    let recencyWeight = 1.0
    if (m.lastUsedAt) {
      const monthsSinceUse = (now - m.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
      recencyWeight = Math.pow(0.9, Math.max(0, monthsSinceUse))
    }

    // Entity matching boost: if memory entity key matches current data
    let entityBoost = 1.0
    if (m.entityKey && entityKeys.length > 0) {
      const normalizedKey = m.entityKey.toLowerCase()
      if (entityKeys.some(ek => ek.toLowerCase().includes(normalizedKey) || normalizedKey.includes(ek.toLowerCase()))) {
        entityBoost = 2.0 // Double weight for matching entities
      }
    }

    const relevanceScore = m.confidence * recencyWeight * entityBoost

    return {
      id: m.id,
      scope: m.scope as any,
      entityKey: m.entityKey,
      category: m.category,
      content,
      conditions,
      confidence: m.confidence,
      correctCount: m.correctCount,
      totalCount: m.totalCount,
      usageCount: m.usageCount,
      relevanceScore,
    }
  })

  // Sort by relevance and take top N
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore)
  const selected = scored.slice(0, maxMemories)

  // Update usage counts for selected memories
  if (selected.length > 0) {
    await prisma.agentMemory.updateMany({
      where: { id: { in: selected.map(m => m.id) } },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    })
  }

  return selected
}
