"use client"

import { useState, useMemo, useCallback } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import {
  CheckCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
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
  /** Columns from the config — only these are shown in results */
  sourceAColumns?: SourceColumnDef[]
  sourceBColumns?: SourceColumnDef[]
  matchedCount: number
  exceptionCount: number
  variance: number
  totalSourceA: number
  totalSourceB: number
  status: string
  completedAt?: string | null
  completedByUser?: { name?: string | null; email: string } | null
  onComplete: () => void
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

/**
 * Find all potential matches from Source B for an unmatched Source A row.
 * Returns matches sorted by similarity score.
 */
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

    // Check if amounts match (within tolerance)
    const directDiff = Math.abs(amountA - amountB)
    const invertedDiff = Math.abs(amountA + amountB)
    const bestDiff = Math.min(directDiff, invertedDiff)

    // Must be within 20% or $100 to be a potential match
    const threshold = Math.max(Math.abs(amountA) * 0.2, 100)
    if (bestDiff > threshold) continue

    // Calculate similarity components
    let similarity = 0
    const differences: string[] = []

    // Amount similarity (0-50 points)
    if (bestDiff < 0.01) similarity += 50
    else if (bestDiff <= 1) similarity += 40
    else similarity += Math.max(20, 50 - bestDiff)

    if (bestDiff >= 0.01) differences.push("Amount")

    // Date similarity (0-25 points)
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

    // Card/reference similarity (0-15 points)
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

    // Text similarity (0-10 points)
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

type TabKey = "auto_matched" | "manual_match" | "not_matched" | "other"

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
  matchedCount,
  exceptionCount,
  variance,
  totalSourceA,
  totalSourceB,
  status,
  completedAt,
  completedByUser,
  onComplete,
  onRefresh,
}: ReconciliationResultsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("auto_matched")
  const [completing, setCompleting] = useState(false)
  const [acceptingMatch, setAcceptingMatch] = useState<string | null>(null)
  const [expandedUnmatchedRow, setExpandedUnmatchedRow] = useState<number | null>(null)

  const isComplete = status === "COMPLETE"

  // Use config columns (matching criteria) if available, otherwise fall back to all columns
  const colsA = useMemo(() => {
    if (sourceAColumns && sourceAColumns.length > 0) return sourceAColumns.map((c) => c.key)
    return getColumnKeys(sourceARows)
  }, [sourceAColumns, sourceARows])
  const colsB = useMemo(() => {
    if (sourceBColumns && sourceBColumns.length > 0) return sourceBColumns.map((c) => c.key)
    return getColumnKeys(sourceBRows)
  }, [sourceBColumns, sourceBRows])

  // Split matched items by type
  const autoMatched = useMemo(
    () => matchResults.matched.filter((m) => m.method !== "manual"),
    [matchResults.matched]
  )
  const manualMatched = useMemo(
    () => matchResults.matched.filter((m) => m.method === "manual"),
    [matchResults.matched]
  )

  // For unmatched Source A rows, compute potential matches from unmatched Source B
  const unmatchedAWithPotentials = useMemo(() => {
    return matchResults.unmatchedA.map((aIdx) => {
      const rowA = sourceARows[aIdx]
      const potentials = rowA ? findPotentialMatches(rowA, sourceBRows, matchResults.unmatchedB) : []
      return { aIdx, potentials }
    })
  }, [matchResults.unmatchedA, matchResults.unmatchedB, sourceARows, sourceBRows])

  // "Not Matched" = ALL unmatched Source A rows (source of truth backbone)
  const notMatchedItems = useMemo(
    () => unmatchedAWithPotentials,
    [unmatchedAWithPotentials]
  )

  // "Other" = Source B orphan rows only (not matched to any Source A)
  const orphanBIndices = useMemo(
    () => matchResults.unmatchedB,
    [matchResults.unmatchedB]
  )

  const matchRate = totalSourceA > 0 ? Math.round((matchedCount / totalSourceA) * 100) : 0

  const handleComplete = async () => {
    if (!confirm("Sign off on this reconciliation? This action cannot be undone.")) return
    setCompleting(true)
    try {
      await fetch(`/api/reconciliations/${configId}/runs/${runId}/complete`, { method: "POST" })
      onRefresh()
    } finally {
      setCompleting(false)
    }
  }

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

  const handleDownloadExcel = useCallback(() => {
    const wb = XLSX.utils.book_new()

    // Helper to build rows for matched pairs
    const buildMatchedRows = (matches: MatchPair[]) =>
      matches.map((match) => {
        const rowA = sourceARows[match.sourceAIdx]
        const rowB = sourceBRows[match.sourceBIdx]
        const row: Record<string, any> = {}
        for (const col of colsA) row[`${sourceALabel} ${col.replace(/_/g, " ")}`] = rowA?.[col] ?? ""
        for (const col of colsB) row[`${sourceBLabel} ${col.replace(/_/g, " ")}`] = rowB?.[col] ?? ""
        row["Match Type"] = match.method === "exact" ? "Exact" : match.method === "manual" ? "Manual" : `AI ${match.confidence}%`
        return row
      })

    // 1. Auto-Matched sheet
    const autoRows = buildMatchedRows(autoMatched)
    const wsAuto = XLSX.utils.json_to_sheet(autoRows.length > 0 ? autoRows : [{ "No Data": "No auto-matched items" }])
    XLSX.utils.book_append_sheet(wb, wsAuto, "Auto-Matched")

    // 2. Manual Matches sheet
    const manualRows = buildMatchedRows(manualMatched)
    const wsManual = XLSX.utils.json_to_sheet(manualRows.length > 0 ? manualRows : [{ "No Data": "No manual matches" }])
    XLSX.utils.book_append_sheet(wb, wsManual, "Manual Matches")

    // 3. Not Matched sheet (all unmatched Source A rows)
    const notMatchedRows = notMatchedItems.map(({ aIdx, potentials }) => {
      const rowA = sourceARows[aIdx]
      const row: Record<string, any> = {}
      for (const col of colsA) row[col.replace(/_/g, " ")] = rowA?.[col] ?? ""
      row["Potential Matches"] = potentials.length
      row["Best Match %"] = potentials.length > 0 ? `${potentials[0].similarity}%` : "—"
      return row
    })
    const wsNotMatched = XLSX.utils.json_to_sheet(notMatchedRows.length > 0 ? notMatchedRows : [{ "No Data": "All source of truth rows matched" }])
    XLSX.utils.book_append_sheet(wb, wsNotMatched, "Not Matched")

    // 4. Other sheet (Source B orphans)
    const otherRows = orphanBIndices.map((bIdx) => {
      const rowB = sourceBRows[bIdx]
      const row: Record<string, any> = {}
      for (const col of colsB) row[col.replace(/_/g, " ")] = rowB?.[col] ?? ""
      return row
    })
    const wsOther = XLSX.utils.json_to_sheet(otherRows.length > 0 ? otherRows : [{ "No Data": `No orphan ${sourceBLabel} rows` }])
    XLSX.utils.book_append_sheet(wb, wsOther, "Other")

    // Write and download
    XLSX.writeFile(wb, `reconciliation-${runId.slice(0, 8)}.xlsx`)
  }, [autoMatched, manualMatched, notMatchedItems, orphanBIndices, colsA, colsB, sourceARows, sourceBRows, sourceALabel, sourceBLabel, runId])

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "auto_matched", label: "Auto-Matched", count: autoMatched.length },
    { key: "manual_match", label: "Manual Matches", count: manualMatched.length },
    { key: "not_matched", label: "Not Matched", count: notMatchedItems.length },
    { key: "other", label: "Other", count: orphanBIndices.length },
  ]

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard label={sourceALabel} value={`${totalSourceA}`} sublabel="rows" />
        <SummaryCard label={sourceBLabel} value={`${totalSourceB}`} sublabel="rows" />
        <SummaryCard
          label="Matched"
          value={`${matchedCount}`}
          sublabel={`${matchRate}%`}
          color={matchRate >= 90 ? "text-green-600" : matchRate >= 70 ? "text-amber-600" : "text-red-600"}
        />
        <SummaryCard
          label="Exceptions"
          value={`${exceptionCount}`}
          sublabel={exceptionCount === 0 ? "Clean" : "Review needed"}
          color={exceptionCount === 0 ? "text-green-600" : "text-amber-600"}
        />
        <SummaryCard
          label="Variance"
          value={`$${Math.abs(variance).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          sublabel={variance === 0 ? "Balanced" : variance > 0 ? "Over" : "Under"}
          color={variance === 0 ? "text-green-600" : "text-red-600"}
        />
      </div>

      {/* Status bar */}
      {isComplete ? (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <p className="text-sm text-green-800">
              Reconciliation complete. Signed off by{" "}
              <span className="font-medium">{completedByUser?.name || completedByUser?.email || "Unknown"}</span>
              {completedAt && ` on ${new Date(completedAt).toLocaleDateString()}`}
            </p>
          </div>
          <Button onClick={handleDownloadExcel} size="sm" variant="outline" className="flex-shrink-0">
            <Download className="w-3 h-3 mr-1" />
            Download Excel
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm text-amber-800">
              {exceptionCount > 0 ? `${exceptionCount} exceptions need resolution.` : "No exceptions. Ready to sign off."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={handleDownloadExcel} size="sm" variant="outline">
              <Download className="w-3 h-3 mr-1" />
              Download Excel
            </Button>
            <Button onClick={handleComplete} disabled={completing} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              {completing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
              Sign Off
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ── Auto-Matched Tab ──────────────────────────────────────── */}
      {activeTab === "auto_matched" && (
        <AutoMatchedTable
          matches={autoMatched}
          sourceARows={sourceARows}
          sourceBRows={sourceBRows}
          colsA={colsA}
          colsB={colsB}
          sourceALabel={sourceALabel}
          sourceBLabel={sourceBLabel}
        />
      )}

      {/* ── Manual Matches Tab ────────────────────────────────────── */}
      {activeTab === "manual_match" && (
        <ManualMatchesTable
          matches={manualMatched}
          sourceARows={sourceARows}
          sourceBRows={sourceBRows}
          colsA={colsA}
          colsB={colsB}
          sourceALabel={sourceALabel}
          sourceBLabel={sourceBLabel}
        />
      )}

      {/* ── Not Matched Tab ───────────────────────────────────────── */}
      {activeTab === "not_matched" && (
        <NotMatchedTable
          items={notMatchedItems}
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

      {/* ── Other Tab (Source B orphans only) ─────────────────────── */}
      {activeTab === "other" && (
        <OtherTable
          orphanBIndices={orphanBIndices}
          sourceBRows={sourceBRows}
          colsB={colsB}
          sourceBLabel={sourceBLabel}
        />
      )}
    </div>
  )
}

// ── Auto-Matched Table ──────────────────────────────────────────────────

function AutoMatchedTable({
  matches,
  sourceARows,
  sourceBRows,
  colsA,
  colsB,
  sourceALabel,
  sourceBLabel,
}: {
  matches: MatchPair[]
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
              <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-20">
                Match
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matches.map((match, i) => {
              const rowA = sourceARows[match.sourceAIdx]
              const rowB = sourceBRows[match.sourceBIdx]
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
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        match.method === "exact" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {match.method === "exact"
                        ? `Exact${match.confidence < 100 ? ` ${match.confidence}%` : ""}${match.signInverted ? " (±)" : ""}`
                        : `AI ${match.confidence}%`}
                    </span>
                  </td>
                </tr>
              )
            })}
            {matches.length === 0 && (
              <tr>
                <td colSpan={colsA.length + colsB.length + 2} className="px-4 py-8 text-center text-sm text-gray-400">
                  No auto-matched items
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
        <span className="ml-auto">
          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Exact</span>
          {" = deterministic match · "}
          <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">AI</span>
          {" = fuzzy match · "}
          <span className="text-gray-500">(±)</span>
          {" = sign-inverted amount"}
        </span>
      </div>
    </div>
  )
}

// ── Manual Matches Table ────────────────────────────────────────────────

function ManualMatchesTable({
  matches,
  sourceARows,
  sourceBRows,
  colsA,
  colsB,
  sourceALabel,
  sourceBLabel,
}: {
  matches: MatchPair[]
  sourceARows: Record<string, any>[]
  sourceBRows: Record<string, any>[]
  colsA: string[]
  colsB: string[]
  sourceALabel: string
  sourceBLabel: string
}) {
  return (
    <div className="space-y-3">
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm text-green-800">
          <strong>Manual Matches:</strong> These are matches you&apos;ve manually accepted from potential matches. Review and verify these matches.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                {colsA.map((col) => (
                  <th
                    key={`a-${col}`}
                    className="px-3 py-2 text-left text-[10px] font-semibold text-white uppercase tracking-wider whitespace-nowrap bg-blue-600"
                  >
                    {sourceALabel} {col.replace(/_/g, " ")}
                  </th>
                ))}
                {colsB.map((col) => (
                  <th
                    key={`b-${col}`}
                    className="px-3 py-2 text-left text-[10px] font-semibold text-white uppercase tracking-wider whitespace-nowrap bg-purple-600"
                  >
                    {sourceBLabel} {col.replace(/_/g, " ")}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider bg-gray-100 whitespace-nowrap">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matches.map((match, i) => {
                const rowA = sourceARows[match.sourceAIdx]
                const rowB = sourceBRows[match.sourceBIdx]
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    {colsA.map((col) => (
                      <td key={`a-${col}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {rowA ? formatCellValue(rowA[col]) : "—"}
                      </td>
                    ))}
                    {colsB.map((col) => (
                      <td key={`b-${col}`} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {rowB ? formatCellValue(rowB[col]) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                        Manual
                      </span>
                    </td>
                  </tr>
                )
              })}
              {matches.length === 0 && (
                <tr>
                  <td colSpan={colsA.length + colsB.length + 1} className="px-4 py-8 text-center text-sm text-gray-400">
                    No manual matches yet. Accept matches from the &quot;Not Matched&quot; tab.
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

// ── Not Matched Table ───────────────────────────────────────────────────

function NotMatchedTable({
  items,
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
  items: { aIdx: number; potentials: PotentialMatch[] }[]
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
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-600 sticky top-0 z-10">
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
            {items.map(({ aIdx, potentials }) => {
              const rowA = sourceARows[aIdx]
              const isExpanded = expandedRow === aIdx

              return (
                <NotMatchedRow
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
            {items.length === 0 && (
              <tr>
                <td colSpan={colsA.length + 1} className="px-4 py-8 text-center text-sm text-gray-400">
                  No unmatched items with potential matches
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NotMatchedRow({
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
      {/* Source A row (pink background) */}
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
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            {isExpanded ? "Hide" : "Show"} Potential Matches ({potentials.length})
          </button>
        </td>
      </tr>

      {/* Expanded: Potential matches from Source B */}
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
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Other Tab (Source B orphans only) ─────────────────────────────────────

function OtherTable({
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

// ── Summary Card ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, sublabel, color }: { label: string; value: string; sublabel: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${color || "text-gray-900"}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sublabel}</p>
    </div>
  )
}
