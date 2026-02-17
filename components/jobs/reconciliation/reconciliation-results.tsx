"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  CheckCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

interface MatchPair {
  sourceAIdx: number
  sourceBIdx: number
  confidence: number
  method: "exact" | "fuzzy_ai"
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

interface ReconciliationResultsProps {
  configId: string
  runId: string
  matchResults: MatchResults
  exceptions: Record<string, ExceptionEntry>
  sourceARows: Record<string, any>[]
  sourceBRows: Record<string, any>[]
  sourceALabel: string
  sourceBLabel: string
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

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  outstanding_check: { label: "Outstanding Check", color: "bg-blue-100 text-blue-700" },
  deposit_in_transit: { label: "Deposit in Transit", color: "bg-indigo-100 text-indigo-700" },
  bank_fee: { label: "Bank Fee", color: "bg-amber-100 text-amber-700" },
  interest: { label: "Interest", color: "bg-green-100 text-green-700" },
  timing_difference: { label: "Timing Difference", color: "bg-purple-100 text-purple-700" },
  data_entry_error: { label: "Data Entry Error", color: "bg-red-100 text-red-700" },
  duplicate: { label: "Duplicate", color: "bg-orange-100 text-orange-700" },
  other: { label: "Other", color: "bg-gray-100 text-gray-700" },
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatCellValue(value: any): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "number") {
    // If it looks like currency (has decimals or is large)
    if (Number.isFinite(value) && (value % 1 !== 0 || Math.abs(value) > 100)) {
      return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return value.toLocaleString()
  }
  const str = String(value)
  // Try to format dates
  if (str.match(/^\d{4}-\d{2}-\d{2}/) || str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
    try {
      const d = new Date(str)
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      }
    } catch { /* fall through */ }
  }
  return str.length > 50 ? str.substring(0, 50) + "…" : str
}

function getColumnKeys(rows: Record<string, any>[]): string[] {
  if (rows.length === 0) return []
  // Use the first row's keys, filtering out internal/system keys
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

// Find the closest potential match from the other source for an unmatched row
function findSuggestedMatch(
  row: Record<string, any>,
  candidateRows: Record<string, any>[],
  candidateIndices: number[]
): { idx: number; score: string } | null {
  const amount = getAmountValue(row)
  if (amount === null || candidateIndices.length === 0) return null

  let bestIdx = -1
  let bestDiff = Infinity

  for (const idx of candidateIndices) {
    const candAmount = getAmountValue(candidateRows[idx])
    if (candAmount === null) continue
    // Check both same-sign and opposite-sign (bank vs GL convention)
    const diff = Math.min(Math.abs(amount - candAmount), Math.abs(amount + candAmount))
    if (diff < bestDiff) {
      bestDiff = diff
      bestIdx = idx
    }
  }

  if (bestIdx === -1) return null
  // Only suggest if reasonably close (within 20% or $100)
  const threshold = Math.max(Math.abs(amount) * 0.2, 100)
  if (bestDiff > threshold) return null

  return {
    idx: bestIdx,
    score: bestDiff < 0.01 ? "Amount match" : `±$${bestDiff.toFixed(2)} difference`,
  }
}

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
  const [view, setView] = useState<"matched" | "exceptions">("matched")
  const [completing, setCompleting] = useState(false)
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  const isComplete = status === "COMPLETE"
  const matchRate = totalSourceA > 0 ? Math.round((matchedCount / totalSourceA) * 100) : 0

  const colsA = useMemo(() => getColumnKeys(sourceARows), [sourceARows])
  const colsB = useMemo(() => getColumnKeys(sourceBRows), [sourceBRows])

  const exceptionsList = useMemo(() => {
    return Object.entries(exceptions || {}).map(([key, val]) => ({
      key,
      ...val,
    }))
  }, [exceptions])

  // Split exceptions by source for the two-panel view
  const exceptionsA = useMemo(() => exceptionsList.filter((e) => e.source === "A"), [exceptionsList])
  const exceptionsB = useMemo(() => exceptionsList.filter((e) => e.source === "B"), [exceptionsList])

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

  const handleResolveException = async (key: string, resolution: string) => {
    setResolvingKey(key)
    try {
      await fetch(`/api/reconciliations/${configId}/runs/${runId}/exceptions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, resolution }),
      })
      onRefresh()
    } finally {
      setResolvingKey(null)
    }
  }

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
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <p className="text-sm text-green-800">
            Reconciliation complete. Signed off by{" "}
            <span className="font-medium">{completedByUser?.name || completedByUser?.email || "Unknown"}</span>
            {completedAt && ` on ${new Date(completedAt).toLocaleDateString()}`}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm text-amber-800">
              {exceptionCount > 0 ? `${exceptionCount} exceptions need resolution.` : "No exceptions. Ready to sign off."}
            </p>
          </div>
          <Button onClick={handleComplete} disabled={completing} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
            {completing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
            Sign Off
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setView("matched")}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            view === "matched"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Matched ({matchedCount})
        </button>
        <button
          onClick={() => setView("exceptions")}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            view === "exceptions"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Unmatched ({exceptionCount})
        </button>
      </div>

      {/* ── Matched Tab ──────────────────────────────────────────── */}
      {view === "matched" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Scrollable table */}
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 w-8">
                    #
                  </th>
                  {/* Source A columns */}
                  {colsA.map((col, i) => (
                    <th
                      key={`a-${col}`}
                      className={`px-3 py-2 text-left text-[10px] font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap ${
                        i === colsA.length - 1 ? "border-r-2 border-gray-300" : ""
                      }`}
                    >
                      {col.replace(/_/g, " ")}
                    </th>
                  ))}
                  {/* Source B columns */}
                  {colsB.map((col) => (
                    <th
                      key={`b-${col}`}
                      className="px-3 py-2 text-left text-[10px] font-semibold text-purple-600 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col.replace(/_/g, " ")}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-20">
                    Match
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matchResults.matched.map((match, i) => {
                  const rowA = sourceARows[match.sourceAIdx]
                  const rowB = sourceBRows[match.sourceBIdx]
                  const isExpanded = expandedRow === i
                  return (
                    <tr
                      key={i}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedRow(isExpanded ? null : i)}
                    >
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
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          match.method === "exact" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {match.method === "exact"
                            ? `Exact${match.confidence < 100 ? ` ${match.confidence}%` : ""}${match.signInverted ? " (±)" : ""}`
                            : `AI ${match.confidence}%`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {matchResults.matched.length === 0 && (
                  <tr>
                    <td colSpan={colsA.length + colsB.length + 2} className="px-4 py-8 text-center text-sm text-gray-400">
                      No matched items
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Source legend */}
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
              {" = amount + date + reference match · "}
              <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">AI</span>
              {" = fuzzy match · "}
              <span className="text-gray-500">(±)</span>
              {" = sign-inverted amount"}
            </span>
          </div>
        </div>
      )}

      {/* ── Exceptions / Unmatched Tab ──────────────────────────── */}
      {view === "exceptions" && (
        <div className="space-y-6">
          {/* Unmatched from Source A */}
          <div>
            <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Unmatched from {sourceALabel} ({exceptionsA.length})
            </h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      {colsA.map((col) => (
                        <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {col.replace(/_/g, " ")}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Suggested Match</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {exceptionsA.map((exc) => {
                      const row = sourceARows[exc.rowIdx]
                      const catInfo = CATEGORY_LABELS[exc.category] || CATEGORY_LABELS.other
                      const suggestion = row ? findSuggestedMatch(row, sourceBRows, matchResults.unmatchedB) : null

                      return (
                        <tr key={exc.key} className="hover:bg-gray-50">
                          {colsA.map((col) => (
                            <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                              {row ? formatCellValue(row[col]) : "—"}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${catInfo.color}`}>
                              {catInfo.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {suggestion ? (
                              <span className="text-[10px] text-purple-600">
                                Row {suggestion.idx + 1} in {sourceBLabel} ({suggestion.score})
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400">No close match</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {exc.resolution ? (
                              <span className={`text-[10px] font-medium ${exc.resolution === "approved" ? "text-green-600" : "text-red-600"}`}>
                                {exc.resolution === "approved" ? "Approved" : "Flagged"}
                              </span>
                            ) : isComplete ? (
                              <span className="text-gray-400 text-[10px]">—</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleResolveException(exc.key, "approved") }}
                                  disabled={resolvingKey === exc.key}
                                  className="text-[10px] text-green-600 hover:text-green-700 underline"
                                >
                                  Approve
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleResolveException(exc.key, "flagged") }}
                                  disabled={resolvingKey === exc.key}
                                  className="text-[10px] text-red-600 hover:text-red-700 underline"
                                >
                                  Flag
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {exceptionsA.length === 0 && (
                      <tr>
                        <td colSpan={colsA.length + 3} className="px-4 py-6 text-center text-sm text-gray-400">
                          All {sourceALabel} rows matched
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Unmatched from Source B */}
          <div>
            <h3 className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Unmatched from {sourceBLabel} ({exceptionsB.length})
            </h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      {colsB.map((col) => (
                        <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {col.replace(/_/g, " ")}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Suggested Match</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {exceptionsB.map((exc) => {
                      const row = sourceBRows[exc.rowIdx]
                      const catInfo = CATEGORY_LABELS[exc.category] || CATEGORY_LABELS.other
                      const suggestion = row ? findSuggestedMatch(row, sourceARows, matchResults.unmatchedA) : null

                      return (
                        <tr key={exc.key} className="hover:bg-gray-50">
                          {colsB.map((col) => (
                            <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                              {row ? formatCellValue(row[col]) : "—"}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${catInfo.color}`}>
                              {catInfo.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {suggestion ? (
                              <span className="text-[10px] text-blue-600">
                                Row {suggestion.idx + 1} in {sourceALabel} ({suggestion.score})
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400">No close match</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {exc.resolution ? (
                              <span className={`text-[10px] font-medium ${exc.resolution === "approved" ? "text-green-600" : "text-red-600"}`}>
                                {exc.resolution === "approved" ? "Approved" : "Flagged"}
                              </span>
                            ) : isComplete ? (
                              <span className="text-gray-400 text-[10px]">—</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleResolveException(exc.key, "approved") }}
                                  disabled={resolvingKey === exc.key}
                                  className="text-[10px] text-green-600 hover:text-green-700 underline"
                                >
                                  Approve
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleResolveException(exc.key, "flagged") }}
                                  disabled={resolvingKey === exc.key}
                                  className="text-[10px] text-red-600 hover:text-red-700 underline"
                                >
                                  Flag
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {exceptionsB.length === 0 && (
                      <tr>
                        <td colSpan={colsB.length + 3} className="px-4 py-6 text-center text-sm text-gray-400">
                          All {sourceBLabel} rows matched
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {exceptionsList.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Clean reconciliation — all rows matched!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sublabel, color }: { label: string; value: string; sublabel: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${color || "text-gray-900"}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sublabel}</p>
    </div>
  )
}
