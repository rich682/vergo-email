"use client"

import { useState, useMemo, useCallback } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
} from "lucide-react"

interface MatchPair {
  sourceAIdx: number
  sourceBIdx: number
  confidence: number
  method: "exact" | "fuzzy_ai" | "manual"
  reasoning?: string
  signInverted?: boolean
}

interface ExceptionEntry {
  category: string
  reason: string
  source: "A" | "B"
  rowIdx: number
  resolution?: string
  resolvedBy?: string
  notes?: string
}

interface MatchResults {
  matched: MatchPair[]
  unmatchedA: number[]
  unmatchedB: number[]
}

interface PotentialMatch {
  sourceBIdx: number
  similarity: number
  differences: string[]
}

interface SourceColumnDef {
  key: string
  label: string
  type: "date" | "amount" | "text" | "reference"
}

interface ReconciliationResultsProps {
  configId: string
  runId: string
  matchResults: MatchResults
  exceptions: Record<string, ExceptionEntry>
  sourceARows: Record<string, any>[]
  sourceBRows: Record<string, any>[]
  sourceALabel: string
  sourceBLabel: string
  sourceAColumns?: SourceColumnDef[]
  sourceBColumns?: SourceColumnDef[]
  status: string
  onRefresh: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatCellValue(value: any): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "number") {
    if (Number.isFinite(value) && (value % 1 !== 0 || Math.abs(value) > 100)) {
      return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return value.toLocaleString()
  }
  const str = String(value)
  if (str.match(/^\d{4}-\d{2}-\d{2}/) || str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
    try {
      const d = new Date(str)
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
      }
    } catch { /* fall through */ }
  }
  return str.length > 50 ? str.substring(0, 50) + "…" : str
}

function getColumnKeys(rows: Record<string, any>[]): string[] {
  if (rows.length === 0) return []
  const INTERNAL = new Set(["__rowIndex", "__parsed", "__sourceFile"])
  return Object.keys(rows[0]).filter((k) => !INTERNAL.has(k))
}

function getAmountValue(row: Record<string, any>): number | null {
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase()
    if (k.includes("amount") || k.includes("debit") || k.includes("credit")) {
      const val = row[key]
      if (typeof val === "number") return val
      if (typeof val === "string") {
        const num = parseFloat(val.replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1"))
        if (!isNaN(num)) return num
      }
    }
  }
  return null
}

function getDateValue(row: Record<string, any>): string | null {
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase()
    if (k.includes("date")) {
      const val = row[key]
      if (val) return String(val)
    }
  }
  return null
}

function getTextValue(row: Record<string, any>): string {
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase()
    if (k.includes("merchant") || k.includes("description") || k.includes("name") || k.includes("payee") || k.includes("vendor")) {
      if (row[key]) return String(row[key])
    }
  }
  return ""
}

function getCardValue(row: Record<string, any>): string | null {
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase()
    if (k.includes("card") || k.includes("account") || k.includes("reference")) {
      if (row[key]) return String(row[key])
    }
  }
  return null
}

function findPotentialMatches(
  rowA: Record<string, any>,
  sourceBRows: Record<string, any>[],
  unmatchedBIndices: number[]
): PotentialMatch[] {
  const amountA = getAmountValue(rowA)
  if (amountA === null || unmatchedBIndices.length === 0) return []

  const matches: PotentialMatch[] = []

  for (const bIdx of unmatchedBIndices) {
    const rowB = sourceBRows[bIdx]
    const amountB = getAmountValue(rowB)
    if (amountB === null) continue

    const directDiff = Math.abs(amountA - amountB)
    const invertedDiff = Math.abs(amountA + amountB)
    const bestDiff = Math.min(directDiff, invertedDiff)

    const threshold = Math.max(Math.abs(amountA) * 0.2, 100)
    if (bestDiff > threshold) continue

    let similarity = 0
    const differences: string[] = []

    if (bestDiff < 0.01) similarity += 50
    else if (bestDiff <= 1) similarity += 40
    else similarity += Math.max(20, 50 - bestDiff)
    if (bestDiff >= 0.01) differences.push("Amount")

    const dateA = getDateValue(rowA)
    const dateB = getDateValue(rowB)
    if (dateA && dateB) {
      try {
        const dA = new Date(dateA)
        const dB = new Date(dateB)
        const daysDiff = Math.abs(Math.floor((dA.getTime() - dB.getTime()) / 86400000))
        if (daysDiff === 0) similarity += 25
        else if (daysDiff <= 3) similarity += 20
        else if (daysDiff <= 7) similarity += 15
        else similarity += 10
        if (daysDiff > 0) differences.push("Date")
      } catch {
        similarity += 10
      }
    } else {
      similarity += 10
    }

    const cardA = getCardValue(rowA)
    const cardB = getCardValue(rowB)
    if (cardA && cardB) {
      if (cardA === cardB) similarity += 15
      else {
        similarity += 5
        differences.push("Card")
      }
    } else {
      similarity += 5
    }

    const textA = getTextValue(rowA).toLowerCase()
    const textB = getTextValue(rowB).toLowerCase()
    if (textA && textB) {
      if (textA === textB) similarity += 10
      else if (textA.includes(textB) || textB.includes(textA)) similarity += 7
      else {
        const tokensA = new Set(textA.split(/\s+/))
        const tokensB = new Set(textB.split(/\s+/))
        let overlap = 0
        for (const t of tokensA) if (tokensB.has(t)) overlap++
        const jac = overlap / Math.max(tokensA.size, tokensB.size)
        similarity += Math.round(jac * 10)
        if (jac < 0.5) differences.push("Merchant")
      }
    }

    const normalizedSimilarity = Math.min(100, Math.round(similarity))
    if (normalizedSimilarity >= 40) {
      matches.push({ sourceBIdx: bIdx, similarity: normalizedSimilarity, differences })
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity)
}

function getMatchBadge(match: MatchPair | null): { label: string; bg: string; text: string } {
  if (!match) return { label: "Unmatched", bg: "bg-red-100", text: "text-red-700" }
  if (match.method === "manual") return { label: "Manual", bg: "bg-blue-100", text: "text-blue-700" }
  if (match.method === "exact" && match.confidence >= 100) {
    return { label: match.signInverted ? "Exact (±)" : "Exact", bg: "bg-green-100", text: "text-green-700" }
  }
  if (match.confidence >= 75) {
    return { label: `AI ${match.confidence}%`, bg: "bg-amber-100", text: "text-amber-700" }
  }
  return { label: `AI ${match.confidence}%`, bg: "bg-orange-100", text: "text-orange-700" }
}

type TabKey = "all" | "exact" | "manual" | "high_prob" | "low_prob" | "orphans"

// ── Component ──────────────────────────────────────────────────────────

export function ReconciliationResults({
  configId,
  runId,
  matchResults,
  exceptions,
  sourceARows,
  sourceBRows,
  sourceALabel,
  sourceBLabel,
  sourceAColumns,
  sourceBColumns,
  status,
  onRefresh,
}: ReconciliationResultsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [acceptingMatch, setAcceptingMatch] = useState<string | null>(null)
  const [expandedUnmatchedRow, setExpandedUnmatchedRow] = useState<number | null>(null)

  const isComplete = status === "COMPLETE"

  const colsA = useMemo(() => {
    if (sourceAColumns && sourceAColumns.length > 0) return sourceAColumns.map((c) => c.key)
    return getColumnKeys(sourceARows)
  }, [sourceAColumns, sourceARows])
  const colsB = useMemo(() => {
    if (sourceBColumns && sourceBColumns.length > 0) return sourceBColumns.map((c) => c.key)
    return getColumnKeys(sourceBRows)
  }, [sourceBColumns, sourceBRows])

  // ── Computed match buckets ──────────────────────────────────────────

  const matchByA = useMemo(() => {
    const map = new Map<number, MatchPair>()
    for (const m of matchResults.matched) {
      map.set(m.sourceAIdx, m)
    }
    return map
  }, [matchResults.matched])

  const allRowsWithStatus = useMemo(() => {
    return sourceARows.map((_, idx) => ({
      aIdx: idx,
      match: matchByA.get(idx) || null,
    }))
  }, [sourceARows, matchByA])

  const exactMatches = useMemo(
    () => matchResults.matched.filter((m) => m.method === "exact" && m.confidence >= 100),
    [matchResults.matched]
  )

  const manualMatched = useMemo(
    () => matchResults.matched.filter((m) => m.method === "manual"),
    [matchResults.matched]
  )

  const highProbMatches = useMemo(
    () =>
      matchResults.matched.filter(
        (m) =>
          m.method !== "manual" &&
          !(m.method === "exact" && m.confidence >= 100) &&
          m.confidence >= 75
      ),
    [matchResults.matched]
  )

  const lowProbMatches = useMemo(
    () => matchResults.matched.filter((m) => m.method !== "manual" && m.confidence < 75),
    [matchResults.matched]
  )

  const unmatchedAWithPotentials = useMemo(() => {
    return matchResults.unmatchedA.map((aIdx) => {
      const rowA = sourceARows[aIdx]
      const potentials = rowA ? findPotentialMatches(rowA, sourceBRows, matchResults.unmatchedB) : []
      return { aIdx, potentials }
    })
  }, [matchResults.unmatchedA, matchResults.unmatchedB, sourceARows, sourceBRows])

  const orphanBIndices = useMemo(() => matchResults.unmatchedB, [matchResults.unmatchedB])

  // ── Actions ─────────────────────────────────────────────────────────

  const handleAcceptMatch = useCallback(async (sourceAIdx: number, sourceBIdx: number) => {
    const key = `${sourceAIdx}-${sourceBIdx}`
    setAcceptingMatch(key)
    try {
      const res = await fetch(`/api/reconciliations/${configId}/runs/${runId}/accept-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAIdx, sourceBIdx }),
      })
      if (res.ok) {
        setExpandedUnmatchedRow(null)
        onRefresh()
      }
    } finally {
      setAcceptingMatch(null)
    }
  }, [configId, runId, onRefresh])

  // ── Excel Download ──────────────────────────────────────────────────

  const handleDownloadExcel = useCallback(() => {
    const wb = XLSX.utils.book_new()

    const buildMatchedRows = (matches: MatchPair[]) =>
      matches.map((match) => {
        const rowA = sourceARows[match.sourceAIdx]
        const rowB = sourceBRows[match.sourceBIdx]
        const row: Record<string, any> = {}
        for (const col of colsA) row[`${sourceALabel} ${col.replace(/_/g, " ")}`] = rowA?.[col] ?? ""
        for (const col of colsB) row[`${sourceBLabel} ${col.replace(/_/g, " ")}`] = rowB?.[col] ?? ""
        row["Match Status"] = getMatchBadge(match).label
        return row
      })

    // 1. All
    const allRows = allRowsWithStatus.map(({ aIdx, match }) => {
      const rowA = sourceARows[aIdx]
      const rowB = match ? sourceBRows[match.sourceBIdx] : null
      const row: Record<string, any> = {}
      for (const col of colsA) row[`${sourceALabel} ${col.replace(/_/g, " ")}`] = rowA?.[col] ?? ""
      for (const col of colsB) row[`${sourceBLabel} ${col.replace(/_/g, " ")}`] = rowB?.[col] ?? ""
      row["Match Status"] = getMatchBadge(match).label
      return row
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows.length > 0 ? allRows : [{ "No Data": "No rows" }]), "All")

    // 2. 100% Matches
    const exactRows = buildMatchedRows(exactMatches)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exactRows.length > 0 ? exactRows : [{ "No Data": "No exact matches" }]), "100% Matches")

    // 3. Manual Matches
    const manualRows = buildMatchedRows(manualMatched)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(manualRows.length > 0 ? manualRows : [{ "No Data": "No manual matches" }]), "Manual Matches")

    // 4. High Probability
    const highRows = buildMatchedRows(highProbMatches)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(highRows.length > 0 ? highRows : [{ "No Data": "No high probability matches" }]), "High Probability")

    // 5. Low Probability
    const lowRows = buildMatchedRows(lowProbMatches)
    const unmatchedRows = unmatchedAWithPotentials.map(({ aIdx }) => {
      const rowA = sourceARows[aIdx]
      const row: Record<string, any> = {}
      for (const col of colsA) row[`${sourceALabel} ${col.replace(/_/g, " ")}`] = rowA?.[col] ?? ""
      for (const col of colsB) row[`${sourceBLabel} ${col.replace(/_/g, " ")}`] = ""
      row["Match Status"] = "Unmatched"
      return row
    })
    const combinedLow = [...lowRows, ...unmatchedRows]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(combinedLow.length > 0 ? combinedLow : [{ "No Data": "No low probability items" }]), "Low Probability")

    // 6. Orphans
    const orphanRows = orphanBIndices.map((bIdx) => {
      const rowB = sourceBRows[bIdx]
      const row: Record<string, any> = {}
      for (const col of colsB) row[col.replace(/_/g, " ")] = rowB?.[col] ?? ""
      return row
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orphanRows.length > 0 ? orphanRows : [{ "No Data": `No orphan ${sourceBLabel} rows` }]), "Orphans")

    XLSX.writeFile(wb, `reconciliation-${runId.slice(0, 8)}.xlsx`)
  }, [allRowsWithStatus, exactMatches, manualMatched, highProbMatches, lowProbMatches, unmatchedAWithPotentials, orphanBIndices, colsA, colsB, sourceARows, sourceBRows, sourceALabel, sourceBLabel, runId])

  // ── Tabs ────────────────────────────────────────────────────────────

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: sourceARows.length },
    { key: "exact", label: "100% Matches", count: exactMatches.length },
    { key: "manual", label: "Manual Matches", count: manualMatched.length },
    { key: "high_prob", label: "High Probability", count: highProbMatches.length },
    { key: "low_prob", label: "Low Probability", count: lowProbMatches.length + unmatchedAWithPotentials.length },
    { key: "orphans", label: "Orphans", count: orphanBIndices.length },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <Button onClick={handleDownloadExcel} size="sm" variant="outline" className="mb-1 ml-2 flex-shrink-0">
          <Download className="w-3 h-3 mr-1" />
          Download Excel
        </Button>
      </div>

      {activeTab === "all" && (
        <AllTable
          rows={allRowsWithStatus}
          sourceARows={sourceARows}
          sourceBRows={sourceBRows}
          colsA={colsA}
          colsB={colsB}
          sourceALabel={sourceALabel}
          sourceBLabel={sourceBLabel}
        />
      )}

      {activeTab === "exact" && (
        <MatchedPairsTable
          matches={exactMatches}
          sourceARows={sourceARows}
          sourceBRows={sourceBRows}
          colsA={colsA}
          colsB={colsB}
          sourceALabel={sourceALabel}
          sourceBLabel={sourceBLabel}
          emptyMessage="No 100% exact matches"
        />
      )}

      {activeTab === "manual" && (
        <MatchedPairsTable
          matches={manualMatched}
          sourceARows={sourceARows}
          sourceBRows={sourceBRows}
          colsA={colsA}
          colsB={colsB}
          sourceALabel={sourceALabel}
          sourceBLabel={sourceBLabel}
          emptyMessage='No manual matches yet. Accept matches from the "Low Probability" tab.'
        />
      )}

      {activeTab === "high_prob" && (
        <MatchedPairsTable
          matches={highProbMatches}
          sourceARows={sourceARows}
          sourceBRows={sourceBRows}
          colsA={colsA}
          colsB={colsB}
          sourceALabel={sourceALabel}
          sourceBLabel={sourceBLabel}
          emptyMessage="No high probability matches (75%+)"
        />
      )}

      {activeTab === "low_prob" && (
        <LowProbabilityTab
          lowProbMatches={lowProbMatches}
          unmatchedItems={unmatchedAWithPotentials}
          sourceARows={sourceARows}
          sourceBRows={sourceBRows}
          colsA={colsA}
          colsB={colsB}
          sourceALabel={sourceALabel}
          sourceBLabel={sourceBLabel}
          expandedRow={expandedUnmatchedRow}
          onToggleExpand={(aIdx) => setExpandedUnmatchedRow(expandedUnmatchedRow === aIdx ? null : aIdx)}
          onAcceptMatch={handleAcceptMatch}
          acceptingMatch={acceptingMatch}
          isComplete={isComplete}
        />
      )}

      {activeTab === "orphans" && (
        <OrphansTable
          orphanBIndices={orphanBIndices}
          sourceBRows={sourceBRows}
          colsB={colsB}
          sourceBLabel={sourceBLabel}
        />
      )}
    </div>
  )
}

// ── All Table ───────────────────────────────────────────────────────────

function AllTable({
  rows,
  sourceARows,
  sourceBRows,
  colsA,
  colsB,
  sourceALabel,
  sourceBLabel,
}: {
  rows: { aIdx: number; match: MatchPair | null }[]
  sourceARows: Record<string, any>[]
  sourceBRows: Record<string, any>[]
  colsA: string[]
  colsB: string[]
  sourceALabel: string
  sourceBLabel: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 w-8">
                #
              </th>
              {colsA.map((col, i) => (
                <th
                  key={`a-${col}`}
                  className={`px-3 py-2 text-left text-[10px] font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap ${
                    i === colsA.length - 1 ? "border-r-2 border-gray-300" : ""
                  }`}
                >
                  {sourceALabel} {col.replace(/_/g, " ")}
                </th>
              ))}
              {colsB.map((col) => (
                <th
                  key={`b-${col}`}
                  className="px-3 py-2 text-left text-[10px] font-semibold text-purple-600 uppercase tracking-wider whitespace-nowrap"
                >
                  {sourceBLabel} {col.replace(/_/g, " ")}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-24">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ aIdx, match }, i) => {
              const rowA = sourceARows[aIdx]
              const rowB = match ? sourceBRows[match.sourceBIdx] : null
              const badge = getMatchBadge(match)
              return (
                <tr key={aIdx} className={`hover:bg-gray-50 ${!match ? "bg-red-50/50" : ""}`}>
                  <td className="px-3 py-2 text-gray-400 border-r border-gray-200 text-center">
                    {i + 1}
                  </td>
                  {colsA.map((col, ci) => (
                    <td
                      key={`a-${col}`}
                      className={`px-3 py-2 text-gray-700 whitespace-nowrap ${
                        ci === colsA.length - 1 ? "border-r-2 border-gray-300" : ""
                      }`}
                    >
                      {rowA ? formatCellValue(rowA[col]) : "—"}
                    </td>
                  ))}
                  {colsB.map((col) => (
                    <td key={`b-${col}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {rowB ? formatCellValue(rowB[col]) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colsA.length + colsB.length + 2} className="px-4 py-8 text-center text-sm text-gray-400">
                  No rows in source file
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-gray-50 border-t flex items-center gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          {sourceALabel}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          {sourceBLabel}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Exact</span>
          <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">AI 75%+</span>
          <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">AI &lt;75%</span>
          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Manual</span>
          <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Unmatched</span>
        </span>
      </div>
    </div>
  )
}

// ── Matched Pairs Table (reusable) ──────────────────────────────────────

function MatchedPairsTable({
  matches,
  sourceARows,
  sourceBRows,
  colsA,
  colsB,
  sourceALabel,
  sourceBLabel,
  emptyMessage,
}: {
  matches: MatchPair[]
  sourceARows: Record<string, any>[]
  sourceBRows: Record<string, any>[]
  colsA: string[]
  colsB: string[]
  sourceALabel: string
  sourceBLabel: string
  emptyMessage: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 w-8">
                #
              </th>
              {colsA.map((col, i) => (
                <th
                  key={`a-${col}`}
                  className={`px-3 py-2 text-left text-[10px] font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap ${
                    i === colsA.length - 1 ? "border-r-2 border-gray-300" : ""
                  }`}
                >
                  {sourceALabel} {col.replace(/_/g, " ")}
                </th>
              ))}
              {colsB.map((col) => (
                <th
                  key={`b-${col}`}
                  className="px-3 py-2 text-left text-[10px] font-semibold text-purple-600 uppercase tracking-wider whitespace-nowrap"
                >
                  {sourceBLabel} {col.replace(/_/g, " ")}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-24">
                Match
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matches.map((match, i) => {
              const rowA = sourceARows[match.sourceAIdx]
              const rowB = sourceBRows[match.sourceBIdx]
              const badge = getMatchBadge(match)
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400 border-r border-gray-200 text-center">
                    {i + 1}
                  </td>
                  {colsA.map((col, ci) => (
                    <td
                      key={`a-${col}`}
                      className={`px-3 py-2 text-gray-700 whitespace-nowrap ${
                        ci === colsA.length - 1 ? "border-r-2 border-gray-300" : ""
                      }`}
                    >
                      {rowA ? formatCellValue(rowA[col]) : "—"}
                    </td>
                  ))}
                  {colsB.map((col) => (
                    <td key={`b-${col}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {rowB ? formatCellValue(rowB[col]) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              )
            })}
            {matches.length === 0 && (
              <tr>
                <td colSpan={colsA.length + colsB.length + 2} className="px-4 py-8 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Low Probability Tab ─────────────────────────────────────────────────

function LowProbabilityTab({
  lowProbMatches,
  unmatchedItems,
  sourceARows,
  sourceBRows,
  colsA,
  colsB,
  sourceALabel,
  sourceBLabel,
  expandedRow,
  onToggleExpand,
  onAcceptMatch,
  acceptingMatch,
  isComplete,
}: {
  lowProbMatches: MatchPair[]
  unmatchedItems: { aIdx: number; potentials: PotentialMatch[] }[]
  sourceARows: Record<string, any>[]
  sourceBRows: Record<string, any>[]
  colsA: string[]
  colsB: string[]
  sourceALabel: string
  sourceBLabel: string
  expandedRow: number | null
  onToggleExpand: (aIdx: number) => void
  onAcceptMatch: (sourceAIdx: number, sourceBIdx: number) => void
  acceptingMatch: string | null
  isComplete: boolean
}) {
  return (
    <div className="space-y-4">
      {lowProbMatches.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Low Confidence Matches ({lowProbMatches.length})
          </h3>
          <MatchedPairsTable
            matches={lowProbMatches}
            sourceARows={sourceARows}
            sourceBRows={sourceBRows}
            colsA={colsA}
            colsB={colsB}
            sourceALabel={sourceALabel}
            sourceBLabel={sourceBLabel}
            emptyMessage="No low probability matches"
          />
        </div>
      )}

      {unmatchedItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Unmatched ({unmatchedItems.length})
          </h3>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-red-600 sticky top-0 z-10">
                  <tr>
                    {colsA.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left text-[10px] font-semibold text-white uppercase tracking-wider whitespace-nowrap"
                      >
                        {sourceALabel} {col.replace(/_/g, " ")}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-white uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedItems.map(({ aIdx, potentials }) => {
                    const rowA = sourceARows[aIdx]
                    const isExpanded = expandedRow === aIdx
                    return (
                      <UnmatchedRow
                        key={aIdx}
                        aIdx={aIdx}
                        rowA={rowA}
                        potentials={potentials}
                        sourceBRows={sourceBRows}
                        colsA={colsA}
                        colsB={colsB}
                        sourceBLabel={sourceBLabel}
                        isExpanded={isExpanded}
                        onToggleExpand={() => onToggleExpand(aIdx)}
                        onAcceptMatch={onAcceptMatch}
                        acceptingMatch={acceptingMatch}
                        isComplete={isComplete}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {lowProbMatches.length === 0 && unmatchedItems.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">
          <CheckCircle2 className="w-6 h-6 text-green-400 mx-auto mb-1" />
          No low probability matches or unmatched items
        </div>
      )}
    </div>
  )
}

// ── Unmatched Row (expandable) ──────────────────────────────────────────

function UnmatchedRow({
  aIdx,
  rowA,
  potentials,
  sourceBRows,
  colsA,
  colsB,
  sourceBLabel,
  isExpanded,
  onToggleExpand,
  onAcceptMatch,
  acceptingMatch,
  isComplete,
}: {
  aIdx: number
  rowA: Record<string, any>
  potentials: PotentialMatch[]
  sourceBRows: Record<string, any>[]
  colsA: string[]
  colsB: string[]
  sourceBLabel: string
  isExpanded: boolean
  onToggleExpand: () => void
  onAcceptMatch: (sourceAIdx: number, sourceBIdx: number) => void
  acceptingMatch: string | null
  isComplete: boolean
}) {
  return (
    <>
      <tr className="bg-red-50 border-t border-gray-200 hover:bg-red-100">
        {colsA.map((col) => (
          <td key={col} className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
            {rowA ? formatCellValue(rowA[col]) : "—"}
          </td>
        ))}
        <td className="px-3 py-2.5">
          <button
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded hover:bg-blue-50 transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {isExpanded ? "Hide" : "Show"} Potential Matches ({potentials.length})
          </button>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={colsA.length + 1} className="p-0">
            <div className="bg-purple-50 border-t border-b border-purple-200 px-6 py-3">
              <p className="text-xs font-semibold text-purple-700 mb-2">
                Potential Matches ({potentials.length})
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {colsB.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-1.5 text-left text-[10px] font-semibold text-purple-600 uppercase tracking-wider whitespace-nowrap"
                      >
                        {sourceBLabel} {col.replace(/_/g, " ")}
                      </th>
                    ))}
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-purple-600 uppercase tracking-wider">
                      Similarity
                    </th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-purple-600 uppercase tracking-wider">
                      Differences
                    </th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-purple-600 uppercase tracking-wider w-28">
                      &nbsp;
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {potentials.map((potential) => {
                    const rowB = sourceBRows[potential.sourceBIdx]
                    const matchKey = `${aIdx}-${potential.sourceBIdx}`
                    const isAccepting = acceptingMatch === matchKey

                    return (
                      <tr key={potential.sourceBIdx} className="border-t border-purple-100 bg-white/50">
                        {colsB.map((col) => (
                          <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                            {rowB ? formatCellValue(rowB[col]) : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              potential.similarity >= 80
                                ? "bg-green-100 text-green-700"
                                : potential.similarity >= 60
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {potential.similarity}%
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {potential.differences.map((diff) => (
                              <span
                                key={diff}
                                className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600"
                              >
                                {diff}
                              </span>
                            ))}
                            {potential.differences.length === 0 && (
                              <span className="text-[10px] text-green-600">Exact</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {!isComplete && (
                            <Button
                              onClick={() => onAcceptMatch(aIdx, potential.sourceBIdx)}
                              disabled={isAccepting}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white text-[10px] h-6 px-2"
                            >
                              {isAccepting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "Accept Match"
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {potentials.length === 0 && (
                    <tr>
                      <td colSpan={colsB.length + 3} className="px-3 py-4 text-center text-xs text-gray-400">
                        No potential matches found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Orphans Table ───────────────────────────────────────────────────────

function OrphansTable({
  orphanBIndices,
  sourceBRows,
  colsB,
  sourceBLabel,
}: {
  orphanBIndices: number[]
  sourceBRows: Record<string, any>[]
  colsB: string[]
  sourceBLabel: string
}) {
  return (
    <div className="space-y-3">
      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="text-sm text-purple-800">
          <strong>Orphan {sourceBLabel} rows:</strong> These rows exist in {sourceBLabel} but have no corresponding entry in the source of truth. They may represent extra transactions, duplicates, or data entry errors.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-purple-600 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-white uppercase tracking-wider w-8">
                  #
                </th>
                {colsB.map((col) => (
                  <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-white uppercase tracking-wider whitespace-nowrap">
                    {col.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orphanBIndices.map((bIdx, i) => {
                const row = sourceBRows[bIdx]
                return (
                  <tr key={bIdx} className="hover:bg-purple-50">
                    <td className="px-3 py-2 text-gray-400 text-center">{i + 1}</td>
                    {colsB.map((col) => (
                      <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {row ? formatCellValue(row[col]) : "—"}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {orphanBIndices.length === 0 && (
                <tr>
                  <td colSpan={colsB.length + 1} className="px-4 py-8 text-center text-sm text-gray-400">
                    <CheckCircle2 className="w-6 h-6 text-green-400 mx-auto mb-1" />
                    No orphan {sourceBLabel} rows — all rows are accounted for.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
