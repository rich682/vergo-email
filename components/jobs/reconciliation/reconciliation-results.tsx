"use client"

import { useState, useMemo, useCallback, Fragment } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Download, AlertTriangle, FileQuestion, ChevronDown, ChevronRight } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────

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
}

interface MatchResults {
  matched: MatchPair[]
  unmatchedA: number[]
  unmatchedB: number[]
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

function formatCellValue(value: any, colKey?: string): string {
  if (value === null || value === undefined || value === "") return "—"
  const isAmountCol = colKey ? /amount|total|debit|credit|charge|balance/i.test(colKey) : false

  if (typeof value === "number") {
    if (isAmountCol || (Number.isFinite(value) && (value % 1 !== 0 || Math.abs(value) > 100))) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    }
    return value.toLocaleString()
  }
  if (isAmountCol && typeof value === "string") {
    const num = parseFloat(value.replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1"))
    if (!isNaN(num)) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
  }
  const str = String(value)
  if (str.match(/^\d{4}-\d{2}-\d{2}/) || str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
    try {
      const d = new Date(str)
      if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
    } catch { /* fall through */ }
  }
  return str.length > 60 ? str.substring(0, 60) + "…" : str
}

function getColumnKeys(rows: Record<string, any>[]): string[] {
  if (rows.length === 0) return []
  return Object.keys(rows[0]).filter((k) => !k.startsWith("__"))
}

function getAmountFromRow(row: Record<string, any>, cols: string[]): number | null {
  for (const key of cols) {
    if (!/amount|total|debit|credit|charge|balance/i.test(key)) continue
    const val = row[key]
    if (typeof val === "number") return val
    if (typeof val === "string") {
      const num = parseFloat(val.replace(/[$,\s]/g, "").replace(/\((.+)\)/, "-$1"))
      if (!isNaN(num)) return num
    }
  }
  return null
}

function formatDollar(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

// ── Component ──────────────────────────────────────────────────────────

type TabKey = "matched" | "unmatched" | "orphans"

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
  const [activeTab, setActiveTab] = useState<TabKey>("matched")
  const [accepting, setAccepting] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [matchingPair, setMatchingPair] = useState<string | null>(null)
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set()) // indices into matchedPairs
  const [rejectedMatches, setRejectedMatches] = useState<Set<number>>(new Set()) // indices into matchedPairs

  const isComplete = status === "COMPLETE"

  const toggleMatchSelect = (idx: number) => {
    setSelectedMatches((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }
  const [ignoredOrphans, setIgnoredOrphans] = useState<Set<number>>(new Set()) // original B indices

  const selectAllMatches = () => {
    if (selectedMatches.size === matchResults.matched.length) {
      setSelectedMatches(new Set())
    } else {
      setSelectedMatches(new Set(matchResults.matched.map((_, i) => i)))
    }
  }

  const colsA = useMemo(() => {
    if (sourceAColumns?.length) return sourceAColumns.map((c) => c.key)
    return getColumnKeys(sourceARows)
  }, [sourceAColumns, sourceARows])

  const colsB = useMemo(() => {
    if (sourceBColumns?.length) return sourceBColumns.map((c) => c.key)
    return getColumnKeys(sourceBRows)
  }, [sourceBColumns, sourceBRows])

  const allColsA = useMemo(() => getColumnKeys(sourceARows), [sourceARows])
  const allColsB = useMemo(() => getColumnKeys(sourceBRows), [sourceBRows])

  // ── Computed data ──────────────────────────────────────────────────

  const matchedPairs = matchResults.matched

  // Filter unmatched/orphan rows: only show rows where ALL mapped columns have data
  const hasAllMappedData = useCallback((row: Record<string, any> | undefined, cols: string[]) => {
    if (!row) return false
    return cols.every((col) => {
      const val = row[col]
      return val !== null && val !== undefined && val !== "" && String(val).trim() !== "" && val !== "—"
    })
  }, [])

  const unmatchedAIndices = useMemo(
    () => matchResults.unmatchedA.filter((idx) => hasAllMappedData(sourceARows[idx], colsA)),
    [matchResults.unmatchedA, sourceARows, colsA, hasAllMappedData]
  )
  const unmatchedBIndices = useMemo(
    () => matchResults.unmatchedB
      .filter((idx) => hasAllMappedData(sourceBRows[idx], colsB))
      .filter((idx) => !ignoredOrphans.has(idx)),
    [matchResults.unmatchedB, sourceBRows, colsB, hasAllMappedData, ignoredOrphans]
  )

  // Variance calculations
  const unmatchedATotal = useMemo(() => {
    return unmatchedAIndices.reduce((sum, idx) => {
      const amt = getAmountFromRow(sourceARows[idx] || {}, allColsA)
      return sum + (amt || 0)
    }, 0)
  }, [unmatchedAIndices, sourceARows, allColsA])

  const unmatchedBTotal = useMemo(() => {
    return unmatchedBIndices.reduce((sum, idx) => {
      const amt = getAmountFromRow(sourceBRows[idx] || {}, allColsB)
      return sum + (amt || 0)
    }, 0)
  }, [unmatchedBIndices, sourceBRows, allColsB])

  const matchedTotal = useMemo(() => {
    return matchedPairs.reduce((sum, m) => {
      const amt = getAmountFromRow(sourceARows[m.sourceAIdx] || {}, allColsA)
      return sum + (amt || 0)
    }, 0)
  }, [matchedPairs, sourceARows, allColsA])

  const netVariance = Math.round((unmatchedATotal - unmatchedBTotal) * 100) / 100
  const totalRows = sourceARows.length + sourceBRows.length
  const matchPct = totalRows > 0 ? Math.round((matchedPairs.length * 2 / totalRows) * 100) : 0

  // ── Potential match suggestions for unmatched A rows ───────────────

  /** For each unmatched A row, find top 3 potential B matches by amount proximity */
  const suggestions = useMemo(() => {
    const matchedBSet = new Set(matchedPairs.map((m) => m.sourceBIdx))
    const availableB = unmatchedBIndices.filter((i) => !matchedBSet.has(i))

    const result: Record<number, { bIdx: number; amtDiff: number; dateDiff: string }[]> = {}

    for (const aIdx of unmatchedAIndices) {
      const amtA = getAmountFromRow(sourceARows[aIdx] || {}, allColsA)
      if (amtA === null) continue

      const candidates: { bIdx: number; amtDiff: number; dateDiff: string }[] = []

      for (const bIdx of availableB) {
        const amtB = getAmountFromRow(sourceBRows[bIdx] || {}, allColsB)
        if (amtB === null) continue

        const diff = Math.abs(Math.abs(amtA) - Math.abs(amtB))
        // Show suggestions within 20% or $50, whichever is larger
        const threshold = Math.max(Math.abs(amtA) * 0.2, 50)
        if (diff > threshold) continue

        // Get dates for display
        const dateB = allColsB.find((k) => /date|tran/i.test(k))
        const dateBVal = dateB ? String(sourceBRows[bIdx]?.[dateB] || "") : ""

        candidates.push({ bIdx, amtDiff: diff, dateDiff: dateBVal })
      }

      candidates.sort((a, b) => a.amtDiff - b.amtDiff)
      if (candidates.length > 0) {
        result[aIdx] = candidates.slice(0, 3)
      }
    }

    return result
  }, [unmatchedAIndices, unmatchedBIndices, matchedPairs, sourceARows, sourceBRows, allColsA, allColsB])

  // ── Actions ────────────────────────────────────────────────────────

  const handleAcceptAll = useCallback(async () => {
    setAccepting(true)
    try {
      // The matched pairs are already in the match results — mark the run as complete
      const res = await fetch(`/api/reconciliations/${configId}/runs/${runId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) onRefresh()
    } finally {
      setAccepting(false)
    }
  }, [configId, runId, onRefresh])

  const handleManualMatch = useCallback(async (sourceAIdx: number, sourceBIdx: number) => {
    const key = `${sourceAIdx}-${sourceBIdx}`
    setMatchingPair(key)
    try {
      const res = await fetch(`/api/reconciliations/${configId}/runs/${runId}/accept-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAIdx, sourceBIdx }),
      })
      if (res.ok) {
        setExpandedRow(null)
        onRefresh()
      }
    } finally {
      setMatchingPair(null)
    }
  }, [configId, runId, onRefresh])

  // ── Excel download ─────────────────────────────────────────────────

  const handleDownloadExcel = useCallback(() => {
    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary
    const summaryData = [
      ["Reconciliation Summary"],
      [],
      ["Source A", sourceALabel, `${sourceARows.length} rows`],
      ["Source B", sourceBLabel, `${sourceBRows.length} rows`],
      [],
      ["Matched", matchedPairs.length, formatDollar(matchedTotal)],
      ["Unmatched Source A", unmatchedAIndices.length, formatDollar(unmatchedATotal)],
      ["Unmatched Source B (Orphans)", unmatchedBIndices.length, formatDollar(unmatchedBTotal)],
      [],
      ["Net Variance", "", formatDollar(netVariance)],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Summary")

    // Sheet 2: Matched
    const matchedRows = matchedPairs.map((m) => {
      const rowA = sourceARows[m.sourceAIdx] || {}
      const rowB = sourceBRows[m.sourceBIdx] || {}
      const row: Record<string, any> = {}
      for (const col of colsA) row[`${sourceALabel} ${col}`] = rowA[col] ?? ""
      for (const col of colsB) row[`${sourceBLabel} ${col}`] = rowB[col] ?? ""
      row["Confidence"] = `${m.confidence}%`
      return row
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matchedRows.length > 0 ? matchedRows : [{ "No Data": "No matched rows" }]), "Matched")

    // Sheet 3: Unmatched Source A
    const unmatchedARows = unmatchedAIndices.map((idx) => {
      const row: Record<string, any> = {}
      for (const col of allColsA) row[col] = sourceARows[idx]?.[col] ?? ""
      return row
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedARows.length > 0 ? unmatchedARows : [{ "No Data": "All rows matched" }]), `Unmatched ${sourceALabel}`)

    // Sheet 4: Unmatched Source B (Orphans)
    const unmatchedBRows = unmatchedBIndices.map((idx) => {
      const row: Record<string, any> = {}
      for (const col of allColsB) row[col] = sourceBRows[idx]?.[col] ?? ""
      return row
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedBRows.length > 0 ? unmatchedBRows : [{ "No Data": "All rows matched" }]), `Unmatched ${sourceBLabel}`)

    XLSX.writeFile(wb, `reconciliation-${runId.slice(0, 8)}.xlsx`)
  }, [matchedPairs, unmatchedAIndices, unmatchedBIndices, sourceARows, sourceBRows, colsA, colsB, allColsA, allColsB, sourceALabel, sourceBLabel, matchedTotal, unmatchedATotal, unmatchedBTotal, netVariance, runId])

  // ── Tabs ───────────────────────────────────────────────────────────

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "matched", label: "Matched", count: matchedPairs.length },
    { key: "unmatched", label: "Unmatched", count: unmatchedAIndices.length },
    { key: "orphans", label: "Orphans", count: unmatchedBIndices.length },
  ]

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Summary Scorecard ─────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">Reconciliation Progress</p>
            <p className="text-2xl font-bold text-gray-900">{matchPct}% matched</p>
          </div>
          <Button onClick={handleDownloadExcel} size="sm" variant="outline">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download Excel
          </Button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2.5 mb-4">
          <div
            className="bg-green-500 h-2.5 rounded-full transition-all"
            style={{ width: `${matchPct}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-700">{matchedPairs.length}</p>
            <p className="text-xs text-green-600">Matched</p>
            <p className="text-xs text-green-500 mt-0.5">{formatDollar(matchedTotal)}</p>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-700">{unmatchedAIndices.length}</p>
            <p className="text-xs text-amber-600">Unmatched ({sourceALabel})</p>
            <p className="text-xs text-amber-500 mt-0.5">{formatDollar(unmatchedATotal)}</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-700">{unmatchedBIndices.length}</p>
            <p className="text-xs text-blue-600">Orphans ({sourceBLabel})</p>
            <p className="text-xs text-blue-500 mt-0.5">{formatDollar(unmatchedBTotal)}</p>
          </div>
          <div className={`text-center p-3 rounded-lg ${netVariance === 0 ? "bg-green-50" : "bg-red-50"}`}>
            <p className={`text-2xl font-bold ${netVariance === 0 ? "text-green-700" : "text-red-700"}`}>
              {formatDollar(Math.abs(netVariance))}
            </p>
            <p className={`text-xs ${netVariance === 0 ? "text-green-600" : "text-red-600"}`}>Net Variance</p>
            {netVariance === 0 && <p className="text-xs text-green-500 mt-0.5">Balanced</p>}
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <div className="flex items-center gap-1">
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
      </div>

      {/* ── Matched Tab ──────────────────────────────────────────── */}
      {activeTab === "matched" && (
        <div className="space-y-3">
          {!isComplete && matchedPairs.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {selectedMatches.size > 0
                  ? `${selectedMatches.size} of ${matchedPairs.length} selected`
                  : `${matchedPairs.length} transactions matched by amount and date — select rows to accept`}
              </p>
              <div className="flex items-center gap-2">
                {selectedMatches.size > 0 ? (
                  <Button
                    onClick={handleAcceptAll}
                    disabled={accepting}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {accepting ? "Accepting..." : `Accept ${selectedMatches.size} Selected`}
                  </Button>
                ) : (
                  <Button
                    onClick={() => { selectAllMatches(); }}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                  >
                    Select All
                  </Button>
                )}
                <Button
                  onClick={() => { selectAllMatches(); handleAcceptAll(); }}
                  disabled={accepting}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {accepting ? (
                    <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" /> Completing...</>
                  ) : (
                    <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Accept All &amp; Complete</>
                  )}
                </Button>
              </div>
            </div>
          )}
          {isComplete && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              Reconciliation completed — all matches accepted
            </div>
          )}
          {matchedPairs.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-8 h-8" />} message="No matched transactions" />
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    {!isComplete && (
                      <th className="px-2 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={selectedMatches.size === matchedPairs.length && matchedPairs.length > 0}
                          onChange={selectAllMatches}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                      </th>
                    )}
                    <Th className="w-10 text-center">#</Th>
                    {colsA.map((col, i) => (
                      <Th key={`a-${col}`} className={i === colsA.length - 1 ? "border-r border-gray-300" : ""}>
                        {sourceALabel} {col.replace(/_/g, " ")}
                      </Th>
                    ))}
                    {colsB.map((col) => (
                      <Th key={`b-${col}`}>{sourceBLabel} {col.replace(/_/g, " ")}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matchedPairs.map((match, i) => {
                    const rowA = sourceARows[match.sourceAIdx]
                    const rowB = sourceBRows[match.sourceBIdx]
                    const isSelected = selectedMatches.has(i)
                    return (
                      <tr key={i} className={`border-b border-gray-100 ${isSelected ? "bg-green-50" : "hover:bg-gray-50"}`}>
                        {!isComplete && (
                          <td className="px-2 py-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleMatchSelect(i)}
                              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                          </td>
                        )}
                        <Td className="text-center text-gray-400">{i + 1}</Td>
                        {colsA.map((col, ci) => (
                          <Td key={`a-${col}`} className={ci === colsA.length - 1 ? "border-r border-gray-200" : ""}>
                            {rowA ? formatCellValue(rowA[col], col) : "—"}
                          </Td>
                        ))}
                        {colsB.map((col) => (
                          <Td key={`b-${col}`}>{rowB ? formatCellValue(rowB[col], col) : "—"}</Td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Unmatched Tab (Source A) ──────────────────────────────── */}
      {activeTab === "unmatched" && (
        <div>
          {unmatchedAIndices.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-8 h-8" />} message={`All ${sourceALabel} rows are matched`} />
          ) : (
            <>
              <p className="text-xs text-amber-600 mb-2">
                These {sourceALabel} rows have no matching amount in {sourceBLabel}. Click a row to see potential matches.
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-amber-50 border-b border-amber-200 sticky top-0">
                    <tr>
                      <Th className="w-8">{""}</Th>
                      <Th className="w-10 text-center">#</Th>
                      {colsA.map((col) => (
                        <Th key={col}>{sourceALabel} {col.replace(/_/g, " ")}</Th>
                      ))}
                      <Th className="w-24">Suggestions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedAIndices.map((aIdx, i) => {
                      const row = sourceARows[aIdx]
                      const hasSuggestions = (suggestions[aIdx]?.length || 0) > 0
                      const isExpanded = expandedRow === aIdx
                      return (
                        <Fragment key={aIdx}>
                          <tr
                            className={`border-b border-gray-100 cursor-pointer ${isExpanded ? "bg-amber-50" : "hover:bg-amber-50/50"}`}
                            onClick={() => setExpandedRow(isExpanded ? null : aIdx)}
                          >
                            <Td className="text-center">
                              {hasSuggestions && (
                                isExpanded
                                  ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                              )}
                            </Td>
                            <Td className="text-center text-gray-400">{i + 1}</Td>
                            {colsA.map((col) => (
                              <Td key={col}>{row ? formatCellValue(row[col], col) : "—"}</Td>
                            ))}
                            <Td>
                              {hasSuggestions ? (
                                <span className="text-xs text-orange-500 font-medium">{suggestions[aIdx].length} found</span>
                              ) : (
                                <span className="text-xs text-gray-400">None</span>
                              )}
                            </Td>
                          </tr>
                          {/* Expanded suggestions */}
                          {isExpanded && hasSuggestions && (
                            <tr>
                              <td colSpan={colsA.length + 3} className="bg-orange-50/50 px-6 py-3 border-b border-orange-200">
                                <p className="text-xs font-medium text-gray-600 mb-2">Potential matches from {sourceBLabel}:</p>
                                <div className="space-y-1">
                                  {suggestions[aIdx].map((s) => {
                                    const bRow = sourceBRows[s.bIdx]
                                    const pairKey = `${aIdx}-${s.bIdx}`
                                    const isMatching = matchingPair === pairKey
                                    return (
                                      <div key={s.bIdx} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
                                        <div className="flex items-center gap-4 text-sm">
                                          {colsB.map((col) => (
                                            <span key={col} className="text-gray-700">
                                              <span className="text-gray-400 text-xs mr-1">{col}:</span>
                                              {bRow ? formatCellValue(bRow[col], col) : "—"}
                                            </span>
                                          ))}
                                          {s.amtDiff > 0.01 && (
                                            <span className="text-xs text-red-500">
                                              (${s.amtDiff.toFixed(2)} difference)
                                            </span>
                                          )}
                                        </div>
                                        {!isComplete && (
                                          <Button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleManualMatch(aIdx, s.bIdx)
                                            }}
                                            disabled={isMatching}
                                            size="sm"
                                            variant="outline"
                                            className="text-xs border-green-300 text-green-700 hover:bg-green-50 ml-3"
                                          >
                                            {isMatching ? "Matching..." : "Match"}
                                          </Button>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Orphans Tab (Source B) ────────────────────────────────── */}
      {activeTab === "orphans" && (
        <div>
          {unmatchedBIndices.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-8 h-8" />} message={`All ${sourceBLabel} rows are matched`} />
          ) : (
            <>
              <p className="text-xs text-blue-600 mb-2">
                These {sourceBLabel} rows have no corresponding entry in {sourceALabel}. They may be fees, payments, or unrecognized charges.
              </p>
              {ignoredOrphans.size > 0 && (
                <p className="text-xs text-gray-400 mb-2">{ignoredOrphans.size} orphan(s) ignored</p>
              )}
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-blue-50 border-b border-blue-200 sticky top-0">
                    <tr>
                      <Th className="w-10 text-center">#</Th>
                      {colsB.map((col) => (
                        <Th key={col}>{sourceBLabel} {col.replace(/_/g, " ")}</Th>
                      ))}
                      {!isComplete && <Th className="w-20">Action</Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedBIndices.map((bIdx, i) => {
                      const row = sourceBRows[bIdx]
                      return (
                        <tr key={bIdx} className="hover:bg-blue-50/50 border-b border-gray-100">
                          <Td className="text-center text-gray-400">{i + 1}</Td>
                          {colsB.map((col) => (
                            <Td key={col}>{row ? formatCellValue(row[col], col) : "—"}</Td>
                          ))}
                          {!isComplete && (
                            <Td>
                              <button
                                onClick={() => setIgnoredOrphans((prev) => { const next = new Set(prev); next.add(bIdx); return next })}
                                className="text-xs text-gray-400 hover:text-red-500"
                              >
                                Ignore
                              </button>
                            </Td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared UI components ──────────────────────────────────────────────

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${className}`}>
      {children}
    </th>
  )
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-2.5 text-sm text-gray-700 ${className}`}>
      {children}
    </td>
  )
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="text-center py-12 border border-gray-200 rounded-lg bg-gray-50">
      <div className="text-gray-300 flex justify-center mb-2">{icon}</div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  )
}
