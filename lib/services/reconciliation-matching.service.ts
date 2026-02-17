/**
 * ReconciliationMatchingService
 * Three-pass matching engine: composite scoring → AI fuzzy → AI exception classification.
 *
 * Pass 1: Composite scored matching using amount + date + reference + text similarity.
 *         Replaces the old greedy first-match approach with ranked scoring and conflict resolution.
 * Pass 2: AI fuzzy matching with full row data + column mapping context.
 * Pass 3: AI exception classification for remaining unmatched items.
 */
import OpenAI from "openai"
import type { SourceConfig, MatchingRules } from "./reconciliation.service"

// ── Types ──────────────────────────────────────────────────────────────

export interface MatchPair {
  sourceAIdx: number
  sourceBIdx: number
  confidence: number  // 0-100
  method: "exact" | "fuzzy_ai" | "manual"
  reasoning?: string
  signInverted?: boolean  // true if amounts matched by sign inversion (bank vs GL)
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

// ── Internal scoring types ─────────────────────────────────────────────

interface CandidateScore {
  bIdx: number
  totalScore: number
  amountScore: number
  dateScore: number
  referenceScore: number
  textScore: number
  signInverted: boolean
}

interface ScoredMatch {
  aIdx: number
  candidates: CandidateScore[]  // sorted by totalScore descending, top 3
}

interface ReferenceMatchResult {
  type: "exact" | "partial" | "none"
  score: number  // 0.0 to 1.0
}

// ── Parsing Helpers ────────────────────────────────────────────────────

function parseAmount(value: any): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return value
  const str = String(value).replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1")
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

function parseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  // Handle Excel serial date numbers (e.g., 46053 = 2026-02-06)
  if (typeof value === "number") {
    if (value > 25000 && value < 60000) {
      const excelEpoch = new Date(1899, 11, 30)
      const d = new Date(excelEpoch.getTime() + value * 86400000)
      return isNaN(d.getTime()) ? null : d
    }
    if (value > 1000000000 && value < 2000000000) {
      return new Date(value * 1000)
    }
    if (value > 1000000000000) {
      return new Date(value)
    }
    return null
  }

  const str = String(value).trim()
  if (!str) return null

  // MM/DD/YYYY or MM-DD-YYYY
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) {
    const d = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]))
    if (!isNaN(d.getTime())) return d
  }

  // DD.MM.YYYY (European dot separator)
  m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) {
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
    if (!isNaN(d.getTime())) return d
  }

  // YYYY-MM-DD or YYYY/MM/DD (ISO-like)
  m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
    if (!isNaN(d.getTime())) return d
  }

  // Fallback: native Date.parse for text formats ("Jan 15, 2026", "15 Feb 2026", etc.)
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function daysDiff(a: Date, b: Date): number {
  return Math.abs(Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)))
}

// ── Column Extraction Helpers ──────────────────────────────────────────

function getColumnByType(row: Record<string, any>, columns: { key: string; type: string }[], type: string): any {
  const col = columns.find((c) => c.type === type)
  return col ? row[col.key] : undefined
}

function getAmountFromRow(row: Record<string, any>, columns: { key: string; type: string }[]): number | null {
  const amountCols = columns.filter((c) => c.type === "amount")
  if (amountCols.length === 0) return null

  if (amountCols.length === 1) {
    return parseAmount(row[amountCols[0].key])
  }

  // Multiple amount columns: net debit/credit
  let total = 0
  for (const col of amountCols) {
    const label = col.key.toLowerCase()
    const val = parseAmount(row[col.key])
    if (val === null) continue
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

function getReferenceFromRow(row: Record<string, any>, columns: { key: string; type: string }[]): string[] {
  return columns
    .filter((c) => c.type === "reference")
    .map((c) => String(row[c.key] || "").trim())
    .filter((v) => v.length > 0)
}

// ── Text Similarity (zero-dependency) ──────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

/**
 * Token-based text similarity with prefix matching for abbreviations.
 * Uses Jaccard-like coefficient + half credit for prefix matches (e.g., "amzn" → "amazon").
 */
function tokenSimilarityWithPrefixes(a: string, b: string): number {
  if (!a || !b) return 0
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  const setB = new Set(tokensB)

  let exactMatches = 0
  for (const t of tokensA) {
    if (setB.has(t)) exactMatches++
  }

  // Prefix matches for abbreviations (min 3 chars)
  let prefixMatches = 0
  for (const tA of tokensA) {
    if (setB.has(tA)) continue // already counted
    for (const tB of tokensB) {
      if (tB === tA) continue
      const shorter = tA.length <= tB.length ? tA : tB
      const longer = tA.length <= tB.length ? tB : tA
      if (shorter.length >= 3 && longer.startsWith(shorter)) {
        prefixMatches += 0.5
        break
      }
    }
  }

  const score = (exactMatches + prefixMatches) / Math.max(tokensA.length, tokensB.length)
  return Math.min(score, 1.0)
}

// ── Reference Matching ─────────────────────────────────────────────────

function referenceMatch(refsA: string[], refsB: string[]): ReferenceMatchResult {
  if (refsA.length === 0 || refsB.length === 0) {
    return { type: "none", score: 0 }
  }

  // Exact string match
  for (const rA of refsA) {
    for (const rB of refsB) {
      if (rA === rB) return { type: "exact", score: 1.0 }
    }
  }

  // Case-insensitive exact match
  for (const rA of refsA) {
    for (const rB of refsB) {
      if (rA.toLowerCase() === rB.toLowerCase()) return { type: "exact", score: 0.95 }
    }
  }

  // Containment (e.g., "12345" in "INV-12345")
  for (const rA of refsA) {
    for (const rB of refsB) {
      const shorter = rA.length <= rB.length ? rA : rB
      const longer = rA.length <= rB.length ? rB : rA
      if (shorter.length >= 3 && longer.includes(shorter)) {
        return { type: "partial", score: 0.7 }
      }
    }
  }

  // Numeric-only comparison (strip non-digits, compare core numbers)
  const numA = refsA.map((r) => r.replace(/\D/g, "")).filter((r) => r.length >= 3)
  const numB = refsB.map((r) => r.replace(/\D/g, "")).filter((r) => r.length >= 3)
  for (const nA of numA) {
    for (const nB of numB) {
      if (nA === nB) return { type: "partial", score: 0.6 }
    }
  }

  return { type: "none", score: 0 }
}

// ── Composite Scoring ──────────────────────────────────────────────────

/**
 * Score a candidate B row against an A row.
 * Returns null if amount or date is outside tolerance (hard gate).
 * Otherwise returns composite score with breakdown.
 */
function scoreCandidate(
  aRow: Record<string, any>,
  bRow: Record<string, any>,
  bIdx: number,
  colsA: { key: string; type: string }[],
  colsB: { key: string; type: string }[],
  matchingRules: MatchingRules,
  hasReferenceColumns: boolean
): CandidateScore | null {
  const amountA = getAmountFromRow(aRow, colsA)
  const amountB = getAmountFromRow(bRow, colsB)
  if (amountA === null || amountB === null) return null

  // ── Amount scoring (hard gate: must match within tolerance) ──
  const amountCol = colsA.find((c) => c.type === "amount")
  const amountTolerance = matchingRules.columnTolerances?.[amountCol?.key || ""]?.tolerance
    ?? matchingRules.amountTolerance ?? 0
  const useExact = amountTolerance === 0 && matchingRules.amountMatch === "exact"

  let amountScore = 0
  let signInverted = false
  const directDiff = Math.abs(amountA - amountB)
  const invertedDiff = Math.abs(amountA + amountB)

  if (useExact) {
    if (directDiff < 0.01) amountScore = 50
    else if (invertedDiff < 0.01) { amountScore = 45; signInverted = true }
    else return null
  } else {
    const tol = amountTolerance || 0
    if (directDiff < 0.01) amountScore = 50
    else if (invertedDiff < 0.01) { amountScore = 45; signInverted = true }
    else if (directDiff <= tol) amountScore = 40
    else if (invertedDiff <= tol) { amountScore = 35; signInverted = true }
    else return null
  }

  // ── Date scoring (hard gate: must be within window if both present) ──
  const dateA = parseDate(getColumnByType(aRow, colsA, "date"))
  const dateB = parseDate(getColumnByType(bRow, colsB, "date"))
  let dateScore = 0

  if (dateA && dateB) {
    const dateCol = colsA.find((c) => c.type === "date")
    const dateWindowDays = matchingRules.columnTolerances?.[dateCol?.key || ""]?.tolerance
      ?? matchingRules.dateWindowDays ?? 0
    const diff = daysDiff(dateA, dateB)

    if (diff > dateWindowDays) return null // Outside date window

    if (diff === 0) dateScore = 25
    else if (diff === 1) dateScore = 22
    else dateScore = Math.max(15, 25 - diff * 2)
  } else {
    dateScore = 10 // One or both missing dates — neutral
  }

  // ── Reference scoring ──
  let referenceScore = 0
  if (hasReferenceColumns) {
    const refsA = getReferenceFromRow(aRow, colsA)
    const refsB = getReferenceFromRow(bRow, colsB)
    const refResult = referenceMatch(refsA, refsB)

    if (refResult.type === "exact") referenceScore = 30
    else if (refResult.type === "partial") referenceScore = Math.round(refResult.score * 30)
    else if (refsA.length > 0 && refsB.length > 0) referenceScore = -5 // Both have refs, no match — negative signal
    // else: one side missing refs, stays 0 (neutral)
  }

  // ── Text similarity scoring (tiebreaker) ──
  const descA = getDescriptionFromRow(aRow, colsA)
  const descB = getDescriptionFromRow(bRow, colsB)
  let textScore = 0
  if (descA && descB) {
    const sim = tokenSimilarityWithPrefixes(descA, descB)
    if (sim >= 0.8) textScore = 10
    else if (sim >= 0.5) textScore = 6
    else if (sim >= 0.2) textScore = 3
  }

  const totalScore = amountScore + dateScore + referenceScore + textScore

  return { bIdx, totalScore, amountScore, dateScore, referenceScore, textScore, signInverted }
}

/**
 * Resolve scored matches: assign each A row to its best available B row.
 * Highest-scoring pairs are assigned first; losing rows fall to their next candidate.
 */
function resolveMatches(scoredMatches: ScoredMatch[]): MatchPair[] {
  const MIN_THRESHOLD = 55
  const result: MatchPair[] = []
  const assignedB = new Set<number>()
  const assignedA = new Set<number>()

  // Sort A rows by their best score (strongest first)
  const sorted = [...scoredMatches].sort(
    (a, b) => (b.candidates[0]?.totalScore ?? 0) - (a.candidates[0]?.totalScore ?? 0)
  )

  for (const sm of sorted) {
    if (assignedA.has(sm.aIdx)) continue

    for (const cand of sm.candidates) {
      if (assignedB.has(cand.bIdx)) continue
      if (cand.totalScore < MIN_THRESHOLD) break

      result.push({
        sourceAIdx: sm.aIdx,
        sourceBIdx: cand.bIdx,
        confidence: Math.min(100, Math.round((cand.totalScore / 105) * 100)),
        method: "exact",
        signInverted: cand.signInverted || undefined,
      })
      assignedA.add(sm.aIdx)
      assignedB.add(cand.bIdx)
      break
    }
  }

  return result
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

    const matchedAIndices = new Set<number>()
    const matchedBIndices = new Set<number>()

    // ── Pass 1: Composite scored matching ──────────────────────────────
    const hasRefColsA = colsA.some((c) => c.type === "reference")
    const hasRefColsB = colsB.some((c) => c.type === "reference")
    const hasReferenceColumns = hasRefColsA && hasRefColsB

    const scoredMatches: ScoredMatch[] = []

    for (let aIdx = 0; aIdx < sourceARows.length; aIdx++) {
      const amountA = getAmountFromRow(sourceARows[aIdx], colsA)
      if (amountA === null) continue

      const candidates: CandidateScore[] = []

      for (let bIdx = 0; bIdx < sourceBRows.length; bIdx++) {
        const score = scoreCandidate(
          sourceARows[aIdx],
          sourceBRows[bIdx],
          bIdx,
          colsA,
          colsB,
          matchingRules,
          hasReferenceColumns
        )
        if (score) candidates.push(score)
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.totalScore - a.totalScore)
        scoredMatches.push({ aIdx, candidates: candidates.slice(0, 3) })
      }
    }

    const matched = resolveMatches(scoredMatches)
    for (const m of matched) {
      matchedAIndices.add(m.sourceAIdx)
      matchedBIndices.add(m.sourceBIdx)
    }

    // Collect unmatched indices
    let unmatchedA = sourceARows.map((_, i) => i).filter((i) => !matchedAIndices.has(i))
    let unmatchedB = sourceBRows.map((_, i) => i).filter((i) => !matchedBIndices.has(i))

    // ── Pass 2: AI fuzzy matching (if enabled) ─────────────────────────
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

        unmatchedA = sourceARows.map((_, i) => i).filter((i) => !matchedAIndices.has(i))
        unmatchedB = sourceBRows.map((_, i) => i).filter((i) => !matchedBIndices.has(i))
      } catch (error) {
        console.error("[Reconciliation] AI fuzzy matching failed, continuing with deterministic results:", error)
      }
    }

    // ── Pass 3: AI exception classification ────────────────────────────
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

    return { matched, unmatchedA, unmatchedB, exceptions, variance }
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

    // Build column mapping context for the AI
    const columnMappings = colsA.map((colA, i) => ({
      sourceA: colA.key,
      sourceB: colsB[i]?.key || "N/A",
      type: colA.type,
    }))

    const allAIMatches: MatchPair[] = []
    const aiMatchedA = new Set<number>()
    const aiMatchedB = new Set<number>()

    const BATCH_SIZE = 30
    const MAX_BATCHES = 3

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const batchAIndices = unmatchedA.filter((idx) => !aiMatchedA.has(idx)).slice(0, BATCH_SIZE)
      const batchBIndices = unmatchedB.filter((idx) => !aiMatchedB.has(idx)).slice(0, BATCH_SIZE)

      if (batchAIndices.length === 0 || batchBIndices.length === 0) break

      // Send ALL column data, not just summary fields
      const batchA = batchAIndices.map((idx) => ({
        idx,
        data: Object.fromEntries(colsA.map((c) => [c.key, sourceARows[idx][c.key]])),
      }))

      const batchB = batchBIndices.map((idx) => ({
        idx,
        data: Object.fromEntries(colsB.map((c) => [c.key, sourceBRows[idx][c.key]])),
      }))

      const columnContext = columnMappings
        .map((m) => `  "${m.sourceA}" ↔ "${m.sourceB}" (${m.type})`)
        .join("\n")

      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a bank reconciliation matching assistant. Match transactions between two sources.

COLUMN MAPPINGS (Source A column → Source B column, type):
${columnContext}

MATCHING RULES:
- Amounts may differ by sign convention (bank debits are negative, GL debits are positive for the same transaction)
- Dates may be off by a few business days (processing delays, posting dates vs transaction dates)
- Descriptions/text columns often use DIFFERENT formats for the SAME entity:
  * "AMAZON MARKETPLACE" = "AMZN MKTP US" (merchant name abbreviations)
  * "WIRE TRANSFER - ACME CORP" = "ACH PMT ACME" (payment method + vendor variations)
  * "CHECK #1234" = "CK 1234" (reference format differences)
  * "PAYROLL - JAN 2026" = "PR 01/2026 DIRECT DEP" (payroll description variations)
- Reference numbers may have different prefixes but share the same core number (e.g., "INV-12345" = "12345")
- Look for semantic matches, not just string matches

Respond with JSON: { "matches": [{ "sourceAIdx": number, "sourceBIdx": number, "confidence": number, "reasoning": string }] }
Only include matches where confidence >= 70. Be conservative — false positives are worse than missing a match.`,
            },
            {
              role: "user",
              content: `Match these unmatched transactions:\n\nSource A (unmatched):\n${JSON.stringify(batchA, null, 1)}\n\nSource B (unmatched):\n${JSON.stringify(batchB, null, 1)}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 1000,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 20000)),
      ])

      const parsed = JSON.parse(response.choices[0]?.message?.content || '{"matches":[]}')
      const batchMatches: MatchPair[] = (parsed.matches || [])
        .filter((m: any) => m.confidence >= 70)
        .map((m: any) => ({
          sourceAIdx: m.sourceAIdx,
          sourceBIdx: m.sourceBIdx,
          confidence: m.confidence,
          method: "fuzzy_ai" as const,
          reasoning: m.reasoning,
        }))

      for (const m of batchMatches) {
        if (!aiMatchedA.has(m.sourceAIdx) && !aiMatchedB.has(m.sourceBIdx)) {
          allAIMatches.push(m)
          aiMatchedA.add(m.sourceAIdx)
          aiMatchedB.add(m.sourceBIdx)
        }
      }

      // If this batch found no matches, no point continuing
      if (batchMatches.length === 0) break
    }

    return allAIMatches
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
