/**
 * ReconciliationLearningService
 * Extracts patterns from completed reconciliation runs and merges them
 * into the config's learnedContext for improving future runs.
 *
 * Called on run completion (sign-off). Analyzes manual matches to discover
 * value mappings, column weight insights, description aliases, and sign conventions.
 */
import { createId } from "@paralleldrive/cuid2"
import { prisma } from "@/lib/prisma"
import type {
  LearnedPattern,
  LearnedContext,
  MatchingStats,
  SourceConfig,
} from "./reconciliation.service"

const MAX_PATTERNS = 20

interface ManualMatchWithContext {
  sourceAIdx: number
  sourceBIdx: number
  context?: {
    sourceAData: Record<string, any>
    sourceBData: Record<string, any>
  }
}

// ── Public API ─────────────────────────────────────────────────────────

export class ReconciliationLearningService {
  /**
   * Extract learning from a completed run and merge into the config's learnedContext.
   */
  static async extractAndSavePatterns(
    configId: string,
    organizationId: string,
    run: {
      id: string
      matchResults: any
      sourceARows: any
      sourceBRows: any
      totalSourceA: number | null
      totalSourceB: number | null
      matchedCount: number | null
    },
    config: {
      sourceAConfig: any
      sourceBConfig: any
      learnedContext: any
    }
  ): Promise<void> {
    const matchResults = run.matchResults as {
      matched: ManualMatchWithContext[]
      unmatchedA: number[]
      unmatchedB: number[]
    } | null

    if (!matchResults) return

    const manualMatches = matchResults.matched.filter(
      (m) => m.method === "manual" && m.context
    ) as (ManualMatchWithContext & { context: NonNullable<ManualMatchWithContext["context"]> })[]

    const sourceAConfig = config.sourceAConfig as SourceConfig
    const sourceBConfig = config.sourceBConfig as SourceConfig
    const existingContext = config.learnedContext as LearnedContext | null

    // Extract new patterns from this run's manual matches
    const newPatterns: LearnedPattern[] = []

    if (manualMatches.length > 0) {
      newPatterns.push(
        ...this.extractValueMappings(manualMatches, sourceAConfig, sourceBConfig),
        ...this.extractColumnWeights(manualMatches, sourceAConfig, sourceBConfig),
        ...this.extractSignConventions(manualMatches, sourceAConfig, sourceBConfig)
      )
    }

    // Update stats
    const totalItems = Math.max(run.totalSourceA || 0, run.totalSourceB || 0)
    const autoMatchCount = matchResults.matched.filter((m: any) => m.method !== "manual").length
    const manualMatchCount = manualMatches.length
    const stats = this.updateStats(existingContext?.stats, {
      totalItems,
      autoMatchCount,
      manualMatchCount,
      runId: run.id,
    })

    // Merge patterns with existing ones
    const mergedPatterns = this.mergePatterns(
      existingContext?.patterns || [],
      newPatterns,
      run.id
    )

    const learnedContext: LearnedContext = {
      patterns: mergedPatterns,
      stats,
      lastLearnedFromRunId: run.id,
    }

    await prisma.reconciliationConfig.updateMany({
      where: { id: configId, organizationId },
      data: { learnedContext: learnedContext as any },
    })
  }

  // ── Pattern Extraction ─────────────────────────────────────────────

  /**
   * Find recurring value mappings between columns (e.g., "JC" → "JOHN COLLINS").
   * Looks at text/reference columns where Source A and B have different values
   * that repeat across multiple manual matches.
   */
  private static extractValueMappings(
    manualMatches: { context: { sourceAData: Record<string, any>; sourceBData: Record<string, any> } }[],
    sourceAConfig: SourceConfig,
    sourceBConfig: SourceConfig
  ): LearnedPattern[] {
    const patterns: LearnedPattern[] = []

    // Compare each Source A column against each Source B column for recurring value pairs
    const textRefColsA = sourceAConfig.columns.filter((c) => c.type === "text" || c.type === "reference")
    const textRefColsB = sourceBConfig.columns.filter((c) => c.type === "text" || c.type === "reference")

    for (const colA of textRefColsA) {
      for (const colB of textRefColsB) {
        const valuePairs = new Map<string, number>()

        for (const match of manualMatches) {
          const valA = String(match.context.sourceAData[colA.key] || "").trim()
          const valB = String(match.context.sourceBData[colB.key] || "").trim()
          if (!valA || !valB || valA === valB) continue

          const pairKey = `${valA}|||${valB}`
          valuePairs.set(pairKey, (valuePairs.get(pairKey) || 0) + 1)
        }

        // Only create patterns for pairs that appear 2+ times
        for (const [pairKey, count] of valuePairs) {
          if (count < 2) continue
          const [from, to] = pairKey.split("|||")
          patterns.push({
            id: createId(),
            type: "value_mapping",
            description: `"${from}" (${colA.label}) maps to "${to}" (${colB.label})`,
            details: {
              from,
              to,
              sourceAColumn: colA.key,
              sourceALabel: colA.label,
              sourceBColumn: colB.key,
              sourceBLabel: colB.label,
              occurrences: count,
            },
            source: "auto",
            confidence: Math.min(50 + count * 15, 95),
            createdAt: new Date().toISOString(),
          })
        }

        // Also look for prefix/substring patterns
        // e.g., if Source A refs consistently contain a 2-letter prefix matching Source B cardholder initials
        this.extractPrefixPatterns(manualMatches, colA, colB, patterns)
      }
    }

    return patterns
  }

  /**
   * Look for prefix/substring patterns between columns.
   * e.g., position 9-10 of Spectrum invoice number contains cardholder initials.
   */
  private static extractPrefixPatterns(
    manualMatches: { context: { sourceAData: Record<string, any>; sourceBData: Record<string, any> } }[],
    colA: { key: string; label: string; type: string },
    colB: { key: string; label: string; type: string },
    patterns: LearnedPattern[]
  ): void {
    if (manualMatches.length < 3) return

    // Check if a consistent substring of colA values matches the first letters of colB values
    const initialsMatches: { position: number; length: number; count: number }[] = []

    // Try different substring positions and lengths (2-4 chars)
    for (let pos = 0; pos < 20; pos++) {
      for (let len = 2; len <= 4; len++) {
        let matchCount = 0
        let totalChecked = 0

        for (const match of manualMatches) {
          const valA = String(match.context.sourceAData[colA.key] || "")
          const valB = String(match.context.sourceBData[colB.key] || "")
          if (valA.length <= pos + len || !valB) continue

          totalChecked++
          const substr = valA.substring(pos, pos + len).toUpperCase()
          // Check if substr matches initials of valB words
          const words = valB.split(/\s+/).filter(Boolean)
          const initials = words.map((w) => w[0]?.toUpperCase()).join("")

          if (substr === initials.substring(0, len)) {
            matchCount++
          }
        }

        if (totalChecked >= 3 && matchCount / totalChecked >= 0.7) {
          initialsMatches.push({ position: pos, length: len, count: matchCount })
        }
      }
    }

    // Take the best initials match if found
    if (initialsMatches.length > 0) {
      const best = initialsMatches.sort((a, b) => b.count - a.count)[0]
      patterns.push({
        id: createId(),
        type: "value_mapping",
        description: `Characters ${best.position + 1}-${best.position + best.length} of "${colA.label}" contain initials matching "${colB.label}"`,
        details: {
          type: "initials_mapping",
          sourceAColumn: colA.key,
          sourceALabel: colA.label,
          sourceBColumn: colB.key,
          sourceBLabel: colB.label,
          position: best.position,
          length: best.length,
          occurrences: best.count,
        },
        source: "auto",
        confidence: Math.min(55 + best.count * 10, 90),
        createdAt: new Date().toISOString(),
      })
    }
  }

  /**
   * Determine which columns are useful for matching vs. not.
   * If manual matches consistently have matching amounts/dates but differing references,
   * that tells us references aren't useful.
   */
  private static extractColumnWeights(
    manualMatches: { context: { sourceAData: Record<string, any>; sourceBData: Record<string, any> } }[],
    sourceAConfig: SourceConfig,
    sourceBConfig: SourceConfig
  ): LearnedPattern[] {
    if (manualMatches.length < 3) return []

    const patterns: LearnedPattern[] = []
    const colPairs = sourceAConfig.columns.map((colA, i) => ({
      colA,
      colB: sourceBConfig.columns[i],
    })).filter((p) => p.colB)

    for (const { colA, colB } of colPairs) {
      let matchCount = 0
      let totalChecked = 0

      for (const match of manualMatches) {
        const valA = match.context.sourceAData[colA.key]
        const valB = match.context.sourceBData[colB.key]
        if (valA == null || valB == null) continue

        totalChecked++
        if (colA.type === "amount") {
          const numA = parseFloat(String(valA).replace(/[,$]/g, ""))
          const numB = parseFloat(String(valB).replace(/[,$]/g, ""))
          if (!isNaN(numA) && !isNaN(numB) && (Math.abs(numA - numB) < 0.01 || Math.abs(numA + numB) < 0.01)) {
            matchCount++
          }
        } else if (colA.type === "reference" || colA.type === "text") {
          const strA = String(valA).toLowerCase().trim()
          const strB = String(valB).toLowerCase().trim()
          if (strA === strB || strA.includes(strB) || strB.includes(strA)) {
            matchCount++
          }
        }
      }

      if (totalChecked < 3) continue

      const matchRate = matchCount / totalChecked

      // If reference/text columns almost never match, flag them as low weight
      if ((colA.type === "reference" || colA.type === "text") && matchRate < 0.2) {
        patterns.push({
          id: createId(),
          type: "column_weight",
          description: `"${colA.label}" and "${colB.label}" rarely match — low value for matching`,
          details: {
            sourceAColumn: colA.key,
            sourceALabel: colA.label,
            sourceBColumn: colB.key,
            sourceBLabel: colB.label,
            weight: "low",
            matchRate,
            sampleSize: totalChecked,
          },
          source: "auto",
          confidence: Math.min(60 + totalChecked * 5, 90),
          createdAt: new Date().toISOString(),
        })
      }
    }

    return patterns
  }

  /**
   * Detect sign convention patterns (e.g., Source A always positive, Source B negative for same amounts).
   */
  private static extractSignConventions(
    manualMatches: { context: { sourceAData: Record<string, any>; sourceBData: Record<string, any> } }[],
    sourceAConfig: SourceConfig,
    sourceBConfig: SourceConfig
  ): LearnedPattern[] {
    if (manualMatches.length < 3) return []

    const amountColsA = sourceAConfig.columns.filter((c) => c.type === "amount")
    const amountColsB = sourceBConfig.columns.filter((c) => c.type === "amount")
    const patterns: LearnedPattern[] = []

    for (const colA of amountColsA) {
      for (const colB of amountColsB) {
        let invertedCount = 0
        let directCount = 0
        let totalChecked = 0

        for (const match of manualMatches) {
          const numA = parseFloat(String(match.context.sourceAData[colA.key] || "0").replace(/[,$]/g, ""))
          const numB = parseFloat(String(match.context.sourceBData[colB.key] || "0").replace(/[,$]/g, ""))
          if (isNaN(numA) || isNaN(numB) || numA === 0 || numB === 0) continue

          totalChecked++
          if (Math.abs(numA + numB) < 0.01) invertedCount++
          else if (Math.abs(numA - numB) < 0.01) directCount++
        }

        if (totalChecked < 3) continue

        if (invertedCount / totalChecked > 0.7) {
          patterns.push({
            id: createId(),
            type: "sign_convention",
            description: `Amounts in "${colA.label}" and "${colB.label}" use opposite signs (one is negative for the same transaction)`,
            details: {
              sourceAColumn: colA.key,
              sourceBColumn: colB.key,
              convention: "inverted",
              occurrences: invertedCount,
              sampleSize: totalChecked,
            },
            source: "auto",
            confidence: Math.min(60 + invertedCount * 10, 95),
            createdAt: new Date().toISOString(),
          })
        }
      }
    }

    return patterns
  }

  // ── Merge & Stats ──────────────────────────────────────────────────

  /**
   * Merge new patterns into existing ones. Deduplicates by type + key details,
   * increases confidence for repeated discoveries. Caps at MAX_PATTERNS.
   */
  private static mergePatterns(
    existing: LearnedPattern[],
    newPatterns: LearnedPattern[],
    runId: string
  ): LearnedPattern[] {
    const merged = [...existing]

    for (const newP of newPatterns) {
      const existingIdx = merged.findIndex((p) => this.isSamePattern(p, newP))

      if (existingIdx >= 0) {
        // Boost confidence of existing pattern
        const e = merged[existingIdx]
        e.confidence = Math.min(e.confidence + 10, 100)
        e.createdFromRunId = runId
        // Merge occurrence counts if present
        if (e.details.occurrences && newP.details.occurrences) {
          e.details.occurrences += newP.details.occurrences
        }
      } else {
        newP.createdFromRunId = runId
        merged.push(newP)
      }
    }

    // Cap at MAX_PATTERNS — keep user patterns, then highest confidence
    if (merged.length > MAX_PATTERNS) {
      merged.sort((a, b) => {
        if (a.source === "user" && b.source !== "user") return -1
        if (b.source === "user" && a.source !== "user") return 1
        return b.confidence - a.confidence
      })
      return merged.slice(0, MAX_PATTERNS)
    }

    return merged
  }

  /** Check if two patterns represent the same discovery */
  private static isSamePattern(a: LearnedPattern, b: LearnedPattern): boolean {
    if (a.type !== b.type) return false

    switch (a.type) {
      case "value_mapping":
        return (
          a.details.from === b.details.from &&
          a.details.to === b.details.to &&
          a.details.sourceAColumn === b.details.sourceAColumn &&
          a.details.sourceBColumn === b.details.sourceBColumn
        )
      case "column_weight":
        return (
          a.details.sourceAColumn === b.details.sourceAColumn &&
          a.details.sourceBColumn === b.details.sourceBColumn &&
          a.details.weight === b.details.weight
        )
      case "sign_convention":
        return (
          a.details.sourceAColumn === b.details.sourceAColumn &&
          a.details.sourceBColumn === b.details.sourceBColumn
        )
      case "description_alias":
        return a.details.from === b.details.from && a.details.to === b.details.to
      default:
        return a.description === b.description
    }
  }

  /** Update aggregate matching stats */
  private static updateStats(
    existing: MatchingStats | undefined,
    runData: {
      totalItems: number
      autoMatchCount: number
      manualMatchCount: number
      runId: string
    }
  ): MatchingStats {
    const totalRuns = (existing?.totalRuns || 0) + 1
    const totalMatched = runData.autoMatchCount + runData.manualMatchCount
    const matchRate = runData.totalItems > 0 ? (runData.autoMatchCount / runData.totalItems) * 100 : 0
    const manualRate = runData.totalItems > 0 ? (runData.manualMatchCount / runData.totalItems) * 100 : 0

    // Rolling average
    const prevWeight = (totalRuns - 1) / totalRuns
    const newWeight = 1 / totalRuns

    return {
      totalRuns,
      avgMatchRate: existing
        ? existing.avgMatchRate * prevWeight + matchRate * newWeight
        : matchRate,
      avgManualMatchRate: existing
        ? existing.avgManualMatchRate * prevWeight + manualRate * newWeight
        : manualRate,
      commonExceptionCategories: existing?.commonExceptionCategories || [],
      lastRunAt: new Date().toISOString(),
    }
  }
}
