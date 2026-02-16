/**
 * Confidence Updater
 *
 * Bayesian confidence updates for agent memories.
 * Uses correct_count / total_count with Beta(1,1) prior.
 */

import { reinforceMemory, weakenMemory } from "../memory/memory-writer"

/**
 * Update memory confidence based on feedback.
 *
 * @param memoryId - The memory to update
 * @param wasCorrect - Whether the agent's recommendation was correct
 */
export async function updateConfidence(
  memoryId: string,
  wasCorrect: boolean
): Promise<void> {
  if (wasCorrect) {
    await reinforceMemory(memoryId)
  } else {
    await weakenMemory(memoryId)
  }
}

/**
 * Calculate the Bayesian confidence from counts.
 * Uses Beta distribution: confidence = correctCount / totalCount
 * Starting prior: Beta(1,1) → correctCount=1, totalCount=2 → confidence=0.5
 */
export function calculateConfidence(correctCount: number, totalCount: number): number {
  if (totalCount === 0) return 0.5
  return correctCount / totalCount
}

/**
 * Determine if a memory is confident enough to recommend a resolution.
 */
export function meetsRecommendationThreshold(
  confidence: number,
  threshold: number = 0.85
): boolean {
  return confidence >= threshold
}
