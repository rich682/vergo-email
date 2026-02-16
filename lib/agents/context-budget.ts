/**
 * Agent Context Budget Manager
 *
 * Manages token budget across reasoning iterations.
 * Progressive compression: full data → unmatched only → current exception.
 */

const HARD_CAP_TOKENS = 80_000 // Leave headroom for 128K context window

interface BudgetAllocation {
  systemPrompt: number   // ~1000
  tools: number          // ~500
  memories: number       // 500-2000
  history: number        // ~1000
  data: number           // Variable
  reserved: number       // For response
}

/**
 * Calculate how much context data to include based on iteration number.
 */
export function getDataBudget(iteration: number, totalRows: number): {
  maxRows: number
  compressionLevel: "full" | "unmatched" | "current"
  maxMemories: number
  maxHistorySteps: number
} {
  if (iteration <= 3) {
    return {
      maxRows: Math.min(totalRows, 200),
      compressionLevel: "full",
      maxMemories: 20,
      maxHistorySteps: 10,
    }
  }

  if (iteration <= 7) {
    return {
      maxRows: Math.min(totalRows, 100),
      compressionLevel: "unmatched",
      maxMemories: 15,
      maxHistorySteps: 5,
    }
  }

  // Iterations 8-10: minimal context
  return {
    maxRows: Math.min(totalRows, 30),
    compressionLevel: "current",
    maxMemories: 10,
    maxHistorySteps: 3,
  }
}

/**
 * Estimate token count for a string (~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Check if adding more content would exceed the hard cap.
 */
export function wouldExceedBudget(currentTokens: number, additionalTokens: number): boolean {
  return (currentTokens + additionalTokens) > HARD_CAP_TOKENS
}

/**
 * Truncate data rows to fit within a token budget.
 */
export function truncateDataToFit(
  rows: unknown[],
  maxTokens: number
): unknown[] {
  const result: unknown[] = []
  let currentTokens = 0

  for (const row of rows) {
    const rowStr = JSON.stringify(row)
    const rowTokens = estimateTokens(rowStr)

    if (currentTokens + rowTokens > maxTokens) {
      break
    }

    result.push(row)
    currentTokens += rowTokens
  }

  return result
}
