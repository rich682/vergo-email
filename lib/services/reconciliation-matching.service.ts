/**
 * ReconciliationMatchingService
 * Three-pass matching engine: deterministic → AI fuzzy → AI exception classification.
 * Follows the same pattern as risk-computation.service.ts (deterministic first, AI second, fallback).
 */
import OpenAI from "openai"
import type { SourceConfig, MatchingRules } from "./reconciliation.service"

// ── Types ──────────────────────────────────────────────────────────────

export interface MatchPair {
  sourceAIdx: number
  sourceBIdx: number
  confidence: number  // 0-100
  method: "exact" | "fuzzy_ai"
  reasoning?: string
}

export interface ExceptionClassification {
  category: string  // outstanding_check, deposit_in_transit, bank_fee, interest, timing_difference, data_entry_error, duplicate, other
  reason: string
  source: "A" | "B"
  rowIdx: number
}

export interface MatchingResult {
  matched: MatchPair[]
  unmatchedA: number[]
  unmatchedB: number[]
  exceptions: ExceptionClassification[]
  variance: number
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseAmount(value: any): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return value
  const str = String(value).replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1")
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

function parseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  const d = new Date(String(value))
  return isNaN(d.getTime()) ? null : d
}

function daysDiff(a: Date, b: Date): number {
  return Math.abs(Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)))
}

function getColumnByType(row: Record<string, any>, columns: { key: string; type: string }[], type: string): any {
  const col = columns.find((c) => c.type === type)
  return col ? row[col.key] : undefined
}

function getAmountFromRow(row: Record<string, any>, columns: { key: string; type: string }[]): number | null {
  // Look for amount columns -- if there are separate debit/credit, net them
  const amountCols = columns.filter((c) => c.type === "amount")
  if (amountCols.length === 0) return null

  if (amountCols.length === 1) {
    return parseAmount(row[amountCols[0].key])
  }

  // Multiple amount columns: try to net debit/credit
  let total = 0
  for (const col of amountCols) {
    const label = col.key.toLowerCase()
    const val = parseAmount(row[col.key])
    if (val === null) continue
    // If it's labeled as debit, treat as positive; credit as negative (or vice versa)
    if (label.includes("debit")) {
      total += Math.abs(val)
    } else if (label.includes("credit")) {
      total -= Math.abs(val)
    } else {
      total += val
    }
  }
  return total
}

function getDescriptionFromRow(row: Record<string, any>, columns: { key: string; type: string }[]): string {
  const textCols = columns.filter((c) => c.type === "text")
  return textCols.map((c) => String(row[c.key] || "")).join(" ").trim()
}

// ── Main Service ───────────────────────────────────────────────────────

export class ReconciliationMatchingService {
  /**
   * Run the full matching pipeline.
   */
  static async runMatching(
    sourceARows: Record<string, any>[],
    sourceBRows: Record<string, any>[],
    sourceAConfig: SourceConfig,
    sourceBConfig: SourceConfig,
    matchingRules: MatchingRules
  ): Promise<MatchingResult> {
    const colsA = sourceAConfig.columns || []
    const colsB = sourceBConfig.columns || []

    // Track which rows are matched
    const matchedAIndices = new Set<number>()
    const matchedBIndices = new Set<number>()
    const matched: MatchPair[] = []

    // ── Pass 1: Deterministic exact matching ─────────────────────────
    for (let aIdx = 0; aIdx < sourceARows.length; aIdx++) {
      if (matchedAIndices.has(aIdx)) continue

      const amountA = getAmountFromRow(sourceARows[aIdx], colsA)
      const dateA = parseDate(getColumnByType(sourceARows[aIdx], colsA, "date"))

      if (amountA === null) continue

      for (let bIdx = 0; bIdx < sourceBRows.length; bIdx++) {
        if (matchedBIndices.has(bIdx)) continue

        const amountB = getAmountFromRow(sourceBRows[bIdx], colsB)
        const dateB = parseDate(getColumnByType(sourceBRows[bIdx], colsB, "date"))

        if (amountB === null) continue

        // Amount check — use per-column tolerance if available, else global
        let amountMatch = false
        const amountCol = colsA.find((c) => c.type === "amount")
        const amountTolerance = matchingRules.columnTolerances?.[amountCol?.key || ""]?.tolerance
          ?? matchingRules.amountTolerance ?? 0
        const useExactAmount = amountTolerance === 0 && matchingRules.amountMatch === "exact"

        if (useExactAmount) {
          amountMatch = Math.abs(amountA - amountB) < 0.01 || Math.abs(amountA + amountB) < 0.01
        } else {
          const tol = amountTolerance || 0
          amountMatch =
            Math.abs(amountA - amountB) <= tol || Math.abs(amountA + amountB) <= tol
        }

        if (!amountMatch) continue

        // Date check — use per-column tolerance if available, else global
        if (dateA && dateB) {
          const dateCol = colsA.find((c) => c.type === "date")
          const dateWindowDays = matchingRules.columnTolerances?.[dateCol?.key || ""]?.tolerance
            ?? matchingRules.dateWindowDays ?? 0
          if (daysDiff(dateA, dateB) > dateWindowDays) continue
        }

        // Match found!
        matched.push({
          sourceAIdx: aIdx,
          sourceBIdx: bIdx,
          confidence: 100,
          method: "exact",
        })
        matchedAIndices.add(aIdx)
        matchedBIndices.add(bIdx)
        break // Move to next A row
      }
    }

    // Collect unmatched indices
    let unmatchedA = sourceARows.map((_, i) => i).filter((i) => !matchedAIndices.has(i))
    let unmatchedB = sourceBRows.map((_, i) => i).filter((i) => !matchedBIndices.has(i))

    // ── Pass 2: AI fuzzy matching (if enabled and there are unmatched items) ─
    if (matchingRules.fuzzyDescription && unmatchedA.length > 0 && unmatchedB.length > 0) {
      try {
        const aiMatches = await this.runAIFuzzyMatching(
          sourceARows,
          sourceBRows,
          colsA,
          colsB,
          unmatchedA,
          unmatchedB
        )

        for (const aiMatch of aiMatches) {
          if (!matchedAIndices.has(aiMatch.sourceAIdx) && !matchedBIndices.has(aiMatch.sourceBIdx)) {
            matched.push(aiMatch)
            matchedAIndices.add(aiMatch.sourceAIdx)
            matchedBIndices.add(aiMatch.sourceBIdx)
          }
        }

        // Recalculate unmatched
        unmatchedA = sourceARows.map((_, i) => i).filter((i) => !matchedAIndices.has(i))
        unmatchedB = sourceBRows.map((_, i) => i).filter((i) => !matchedBIndices.has(i))
      } catch (error) {
        console.error("[Reconciliation] AI fuzzy matching failed, continuing with deterministic results:", error)
      }
    }

    // ── Pass 3: AI exception classification ──────────────────────────
    let exceptions: ExceptionClassification[] = []
    if (unmatchedA.length > 0 || unmatchedB.length > 0) {
      try {
        exceptions = await this.classifyExceptions(
          sourceARows,
          sourceBRows,
          colsA,
          colsB,
          unmatchedA,
          unmatchedB,
          sourceAConfig.label,
          sourceBConfig.label
        )
      } catch (error) {
        console.error("[Reconciliation] AI exception classification failed:", error)
        // Fallback: label all as unclassified
        exceptions = [
          ...unmatchedA.map((idx) => ({
            category: "other",
            reason: "Unmatched item",
            source: "A" as const,
            rowIdx: idx,
          })),
          ...unmatchedB.map((idx) => ({
            category: "other",
            reason: "Unmatched item",
            source: "B" as const,
            rowIdx: idx,
          })),
        ]
      }
    }

    // Calculate variance
    const unmatchedATotal = unmatchedA.reduce((sum, idx) => {
      const amt = getAmountFromRow(sourceARows[idx], colsA)
      return sum + (amt || 0)
    }, 0)
    const unmatchedBTotal = unmatchedB.reduce((sum, idx) => {
      const amt = getAmountFromRow(sourceBRows[idx], colsB)
      return sum + (amt || 0)
    }, 0)
    const variance = Math.round((unmatchedATotal - unmatchedBTotal) * 100) / 100

    return {
      matched,
      unmatchedA,
      unmatchedB,
      exceptions,
      variance,
    }
  }

  // ── Pass 2: AI Fuzzy Matching ──────────────────────────────────────

  private static async runAIFuzzyMatching(
    sourceARows: Record<string, any>[],
    sourceBRows: Record<string, any>[],
    colsA: { key: string; type: string }[],
    colsB: { key: string; type: string }[],
    unmatchedA: number[],
    unmatchedB: number[]
  ): Promise<MatchPair[]> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Prepare summaries of unmatched items (batch up to 30 from each side)
    const batchA = unmatchedA.slice(0, 30).map((idx) => ({
      idx,
      amount: getAmountFromRow(sourceARows[idx], colsA),
      date: getColumnByType(sourceARows[idx], colsA, "date"),
      description: getDescriptionFromRow(sourceARows[idx], colsA),
      reference: getColumnByType(sourceARows[idx], colsA, "reference"),
    }))

    const batchB = unmatchedB.slice(0, 30).map((idx) => ({
      idx,
      amount: getAmountFromRow(sourceBRows[idx], colsB),
      date: getColumnByType(sourceBRows[idx], colsB, "date"),
      description: getDescriptionFromRow(sourceBRows[idx], colsB),
      reference: getColumnByType(sourceBRows[idx], colsB, "reference"),
    }))

    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a bank reconciliation matching assistant. Match transactions between two sources based on amount similarity, date proximity, description similarity, and reference numbers.
Amounts may differ by sign convention (bank vs GL). Dates may be off by a few days. Descriptions will be different text but refer to the same transaction.
Respond with JSON: { "matches": [{ "sourceAIdx": number, "sourceBIdx": number, "confidence": number, "reasoning": string }] }
Only include matches where confidence >= 70. Be conservative -- false positives are worse than missing a match.`,
          },
          {
            role: "user",
            content: `Match these unmatched transactions:\n\nSource A (unmatched):\n${JSON.stringify(batchA, null, 1)}\n\nSource B (unmatched):\n${JSON.stringify(batchB, null, 1)}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 500,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 15000)),
    ])

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{"matches":[]}')
    const aiMatches: MatchPair[] = (parsed.matches || [])
      .filter((m: any) => m.confidence >= 70)
      .map((m: any) => ({
        sourceAIdx: m.sourceAIdx,
        sourceBIdx: m.sourceBIdx,
        confidence: m.confidence,
        method: "fuzzy_ai" as const,
        reasoning: m.reasoning,
      }))

    return aiMatches
  }

  // ── Pass 3: Exception Classification ───────────────────────────────

  private static async classifyExceptions(
    sourceARows: Record<string, any>[],
    sourceBRows: Record<string, any>[],
    colsA: { key: string; type: string }[],
    colsB: { key: string; type: string }[],
    unmatchedA: number[],
    unmatchedB: number[],
    sourceALabel: string,
    sourceBLabel: string
  ): Promise<ExceptionClassification[]> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const itemsA = unmatchedA.slice(0, 30).map((idx) => ({
      source: "A",
      idx,
      amount: getAmountFromRow(sourceARows[idx], colsA),
      date: getColumnByType(sourceARows[idx], colsA, "date"),
      description: getDescriptionFromRow(sourceARows[idx], colsA),
    }))

    const itemsB = unmatchedB.slice(0, 30).map((idx) => ({
      source: "B",
      idx,
      amount: getAmountFromRow(sourceBRows[idx], colsB),
      date: getColumnByType(sourceBRows[idx], colsB, "date"),
      description: getDescriptionFromRow(sourceBRows[idx], colsB),
    }))

    const allItems = [...itemsA, ...itemsB]
    if (allItems.length === 0) return []

    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a bank reconciliation assistant. Classify unmatched items from a reconciliation between "${sourceALabel}" and "${sourceBLabel}".
Categories: outstanding_check, deposit_in_transit, bank_fee, interest, timing_difference, data_entry_error, duplicate, other
Respond with JSON: { "classifications": [{ "source": "A"|"B", "idx": number, "category": string, "reason": string }] }
Provide a brief, clear reason for each classification.`,
          },
          {
            role: "user",
            content: `Classify these unmatched reconciliation items:\n${JSON.stringify(allItems, null, 1)}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 500,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 15000)),
    ])

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{"classifications":[]}')
    const classifications: ExceptionClassification[] = (parsed.classifications || []).map((c: any) => ({
      category: c.category || "other",
      reason: c.reason || "Unmatched item",
      source: c.source || "A",
      rowIdx: c.idx,
    }))

    // Ensure every unmatched item has a classification
    const classifiedKeys = new Set(classifications.map((c) => `${c.source}-${c.rowIdx}`))
    for (const idx of unmatchedA) {
      if (!classifiedKeys.has(`A-${idx}`)) {
        classifications.push({ category: "other", reason: "Unclassified", source: "A", rowIdx: idx })
      }
    }
    for (const idx of unmatchedB) {
      if (!classifiedKeys.has(`B-${idx}`)) {
        classifications.push({ category: "other", reason: "Unclassified", source: "B", rowIdx: idx })
      }
    }

    return classifications
  }
}
