"use client"

import { useState, useMemo, useCallback, useEffect, Fragment } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Download, AlertTriangle, FileQuestion, ChevronDown, ChevronRight } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────

interface MatchPair {
  sourceAIdx: number
  sourceBIdx: number
  /** Many B rows combined into this match (1 A : N B). Absent for 1:1. */
  sourceBIdxs?: number[]
  /** Many A rows combined into this match (N A : 1 B). Absent for 1:1. */
  sourceAIdxs?: number[]
  confidence: number
  method: "exact" | "fuzzy_ai" | "manual"
  reasoning?: string
  signInverted?: boolean
  /** User has reviewed and accepted this match (persisted server-side) */
  accepted?: boolean
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
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set())
  // Hydrate accepted match indices from the server (matchResults.matched[i].accepted)
  const [acceptedMatches, setAcceptedMatches] = useState<Set<number>>(() => {
    const s = new Set<number>()
    matchResults.matched.forEach((m, i) => { if (m.accepted) s.add(i) })
    return s
  })

  // Re-sync when matchResults change (e.g. after a refresh or new match)
  useEffect(() => {
    const s = new Set<number>()
    matchResults.matched.forEach((m, i) => { if (m.accepted) s.add(i) })
    setAcceptedMatches(s)
  }, [matchResults])

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
  // Orphans selected for multi-match (used in both Unmatched and Orphans tabs)
  const [selectedOrphans, setSelectedOrphans] = useState<Set<number>>(new Set())
  const [orphanFilter, setOrphanFilter] = useState("")

  // Switching tabs resets per-tab selection state
  const switchTab = useCallback((key: TabKey) => {
    setActiveTab(key)
    setExpandedRow(null)
    setSelectedOrphans(new Set())
    setOrphanFilter("")
  }, [])

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

  // Analytics driven by what the user has ACCEPTED (not just system-matched)
  const acceptedCount = acceptedMatches.size
  const acceptedTotal = useMemo(() => {
    return [...acceptedMatches].reduce((sum, idx) => {
      const m = matchedPairs[idx]
      if (!m) return sum
      const amt = getAmountFromRow(sourceARows[m.sourceAIdx] || {}, allColsA)
      return sum + (amt || 0)
    }, 0)
  }, [acceptedMatches, matchedPairs, sourceARows, allColsA])

  const pendingReviewCount = matchedPairs.length - acceptedCount
  const netVariance = Math.round((unmatchedATotal - unmatchedBTotal) * 100) / 100
  const totalTransactions = matchedPairs.length + unmatchedAIndices.length + unmatchedBIndices.length
  const matchPct = totalTransactions > 0 ? Math.round((acceptedCount / totalTransactions) * 100) : 0

  // ── Actions ────────────────────────────────────────────────────────

  /** Persist accepted flag server-side; optimistically update local state */
  const persistAccepted = useCallback(async (indices: number[], accepted: boolean) => {
    if (indices.length === 0) return
    setAcceptedMatches((prev) => {
      const next = new Set(prev)
      for (const idx of indices) {
        if (accepted) next.add(idx)
        else next.delete(idx)
      }
      return next
    })
    try {
      await fetch(`/api/reconciliations/${configId}/runs/${runId}/accept-matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indices, accepted }),
      })
    } catch (err) {
      console.error("Failed to persist accepted matches:", err)
    }
  }, [configId, runId])

  const handleAcceptSelected = useCallback(() => {
    const indices = Array.from(selectedMatches)
    void persistAccepted(indices, true)
    setSelectedMatches(new Set())
  }, [selectedMatches, persistAccepted])

  const handleAcceptAll = useCallback(() => {
    const indices = matchedPairs.map((_, i) => i)
    void persistAccepted(indices, true)
    setSelectedMatches(new Set())
  }, [matchedPairs, persistAccepted])

  const handleUnaccept = useCallback((idx: number) => {
    void persistAccepted([idx], false)
  }, [persistAccepted])

  const handleComplete = useCallback(async () => {
    setAccepting(true)
    try {
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

  const handleManualMatch = useCallback(async (
    sourceA: number | number[],
    sourceB: number | number[]
  ) => {
    const aArr = Array.isArray(sourceA) ? sourceA : [sourceA]
    const bArr = Array.isArray(sourceB) ? sourceB : [sourceB]
    const key = `${aArr.join(",")}-${bArr.join(",")}`
    setMatchingPair(key)
    try {
      const body: Record<string, number | number[]> = {}
      if (aArr.length === 1) body.sourceAIdx = aArr[0]
      else body.sourceAIdxs = aArr
      if (bArr.length === 1) body.sourceBIdx = bArr[0]
      else body.sourceBIdxs = bArr

      const res = await fetch(`/api/reconciliations/${configId}/runs/${runId}/accept-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setExpandedRow(null)
        setSelectedOrphans(new Set())
        setOrphanFilter("")
        onRefresh()
      }
    } finally {
      setMatchingPair(null)
    }
  }, [configId, runId, onRefresh])

  // When the expanded row changes, clear the per-row orphan selection
  const toggleExpandedRow = useCallback((aIdx: number) => {
    setExpandedRow((prev) => {
      const next = prev === aIdx ? null : aIdx
      setSelectedOrphans(new Set())
      setOrphanFilter("")
      return next
    })
  }, [])

  // Expand/collapse an orphan row; selections reset so the user picks Source A rows fresh
  const toggleExpandedOrphan = useCallback((bIdx: number) => {
    setExpandedRow((prev) => (prev === bIdx ? null : bIdx))
    setSelectedOrphans(new Set())
    setOrphanFilter("")
  }, [])

  // ── Excel download ─────────────────────────────────────────────────

  const handleDownloadExcel = useCallback(() => {
    try {
      const wb = XLSX.utils.book_new()
      // Sheet names max 31 chars, no special chars
      const cleanName = (s: string) => s.replace(/[\\\/\?\*\[\]]/g, "").slice(0, 31)

      // Sheet 1: Summary
      const summaryData = [
        ["Reconciliation Summary"],
        [],
        ["Source A", sourceALabel, `${sourceARows.length} rows`],
        ["Source B", sourceBLabel, `${sourceBRows.length} rows`],
        [],
        ["Accepted", acceptedCount, formatDollar(acceptedTotal)],
        ["Pending Review", pendingReviewCount],
        ["Unmatched Source A", unmatchedAIndices.length, formatDollar(unmatchedATotal)],
        ["Unmatched Source B (Orphans)", unmatchedBIndices.length, formatDollar(unmatchedBTotal)],
        [],
        ["Net Variance", "", formatDollar(netVariance)],
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Summary")

      // Sheet 2: Matched — multi-match groups (many-A or many-B) emit one row per
      // sub-item, with the single-side columns repeated only on the first sub-row.
      const matchedRows: Record<string, any>[] = []
      matchedPairs.forEach((m, mi) => {
        const aIdxs = m.sourceAIdxs && m.sourceAIdxs.length > 0 ? m.sourceAIdxs : [m.sourceAIdx]
        const bIdxs = m.sourceBIdxs && m.sourceBIdxs.length > 0 ? m.sourceBIdxs : [m.sourceBIdx]
        const isManyA = aIdxs.length > 1
        const isManyB = bIdxs.length > 1
        const subCount = Math.max(aIdxs.length, bIdxs.length)
        const matchType = isManyA ? `${aIdxs.length}:1` : isManyB ? `1:${bIdxs.length}` : "1:1"

        for (let s = 0; s < subCount; s++) {
          const aIdx = isManyA ? aIdxs[s] : aIdxs[0]
          const bIdx = isManyB ? bIdxs[s] : bIdxs[0]
          const rowA = sourceARows[aIdx] || {}
          const rowB = sourceBRows[bIdx] || {}
          const row: Record<string, any> = {}
          row["Match #"] = mi + 1
          row["Match Type"] = matchType
          for (const col of colsA) {
            row[`Source A ${col}`] = (isManyA || s === 0) ? (rowA[col] ?? "") : ""
          }
          for (const col of colsB) {
            row[`Source B ${col}`] = (isManyB || s === 0) ? (rowB[col] ?? "") : ""
          }
          row["Status"] = acceptedMatches.has(mi) ? "Accepted" : "Pending"
          matchedRows.push(row)
        }
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matchedRows.length > 0 ? matchedRows : [{ "No Data": "No matched rows" }]), "Matched")

      // Sheet 3: Unmatched Source A
      const unmatchedARows = unmatchedAIndices.map((idx) => {
        const row: Record<string, any> = {}
        for (const col of allColsA) row[col] = sourceARows[idx]?.[col] ?? ""
        return row
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedARows.length > 0 ? unmatchedARows : [{ "No Data": "All rows matched" }]), cleanName(`Unmatched ${sourceALabel}`))

    // Sheet 4: Unmatched Source B (Orphans)
    const unmatchedBRows = unmatchedBIndices.map((idx) => {
      const row: Record<string, any> = {}
      for (const col of allColsB) row[col] = sourceBRows[idx]?.[col] ?? ""
      return row
    })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedBRows.length > 0 ? unmatchedBRows : [{ "No Data": "All rows matched" }]), cleanName(`Unmatched ${sourceBLabel}`))

      XLSX.writeFile(wb, `reconciliation-${runId.slice(0, 8)}.xlsx`)
    } catch (err) {
      console.error("Excel download failed:", err)
      alert("Failed to download Excel. Check console for details.")
    }
  }, [matchedPairs, unmatchedAIndices, unmatchedBIndices, sourceARows, sourceBRows, colsA, colsB, allColsA, allColsB, sourceALabel, sourceBLabel, acceptedCount, acceptedTotal, pendingReviewCount, unmatchedATotal, unmatchedBTotal, netVariance, runId, acceptedMatches])

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
        <div className="grid grid-cols-5 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-700">{acceptedCount}</p>
            <p className="text-xs text-green-600">Accepted</p>
            <p className="text-xs text-green-500 mt-0.5">{formatDollar(acceptedTotal)}</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-700">{pendingReviewCount}</p>
            <p className="text-xs text-gray-500">Pending Review</p>
            <p className="text-xs text-gray-400 mt-0.5">{matchedPairs.length} system matched</p>
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
              onClick={() => switchTab(tab.key)}
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
                {acceptedMatches.size > 0 && `${acceptedMatches.size} accepted. `}
                {selectedMatches.size > 0
                  ? `${selectedMatches.size} selected`
                  : `${matchedPairs.length - acceptedMatches.size} pending review`}
              </p>
              <div className="flex items-center gap-2">
                {selectedMatches.size > 0 && (
                  <Button onClick={handleAcceptSelected} size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Accept {selectedMatches.size} Selected
                  </Button>
                )}
                {acceptedMatches.size < matchedPairs.length && (
                  <Button onClick={handleAcceptAll} size="sm" variant="outline" className="text-xs">
                    Accept All {matchedPairs.length}
                  </Button>
                )}
                {acceptedMatches.size > 0 && (
                  <Button
                    onClick={handleComplete}
                    disabled={accepting}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {accepting ? (
                      <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" /> Completing...</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Complete Reconciliation</>
                    )}
                  </Button>
                )}
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
                    const aIdxs = match.sourceAIdxs && match.sourceAIdxs.length > 0
                      ? match.sourceAIdxs
                      : [match.sourceAIdx]
                    const bIdxs = match.sourceBIdxs && match.sourceBIdxs.length > 0
                      ? match.sourceBIdxs
                      : [match.sourceBIdx]
                    const isManyA = aIdxs.length > 1
                    const isManyB = bIdxs.length > 1
                    // Visual row count = the side with multiple rows (or 1 for 1:1)
                    const subRowCount = Math.max(aIdxs.length, bIdxs.length)
                    const isMulti = subRowCount > 1
                    const isSelected = selectedMatches.has(i)
                    const isAccepted = acceptedMatches.has(i)
                    const bgClass = isAccepted ? "bg-green-50/70" : isSelected ? "bg-orange-50" : "hover:bg-gray-50"

                    // Badge describes which direction the many-to-one runs
                    const badgeLabel = isManyA
                      ? `${aIdxs.length}:1`
                      : isManyB
                        ? `1:${bIdxs.length}`
                        : null
                    const badgeTitle = isManyA
                      ? `${aIdxs.length} ${sourceALabel} rows combined`
                      : isManyB
                        ? `${bIdxs.length} ${sourceBLabel} rows combined`
                        : ""

                    return (
                      <Fragment key={i}>
                        {Array.from({ length: subRowCount }).map((_, subIdx) => {
                          const aIdx = isManyA ? aIdxs[subIdx] : aIdxs[0]
                          const bIdx = isManyB ? bIdxs[subIdx] : bIdxs[0]
                          const rowA = sourceARows[aIdx]
                          const rowB = sourceBRows[bIdx]
                          const isFirst = subIdx === 0
                          const isLast = subIdx === subRowCount - 1
                          return (
                            <tr
                              key={`${i}-${subIdx}`}
                              className={`${bgClass} ${isLast ? "border-b border-gray-100" : ""}`}
                            >
                              {isFirst && (
                                <>
                                  {!isComplete && (
                                    <td className="px-2 py-2.5 align-top" rowSpan={subRowCount}>
                                      {isAccepted ? (
                                        <button onClick={() => handleUnaccept(i)} title="Unaccept">
                                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                                        </button>
                                      ) : (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleMatchSelect(i)}
                                          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                                        />
                                      )}
                                    </td>
                                  )}
                                  <td
                                    className="px-3 py-2.5 text-sm text-gray-400 text-center align-top"
                                    rowSpan={subRowCount}
                                  >
                                    <span className="inline-flex flex-col items-center">
                                      <span>{i + 1}</span>
                                      {isMulti && badgeLabel && (
                                        <span
                                          className="mt-0.5 px-1 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-medium whitespace-nowrap"
                                          title={badgeTitle}
                                        >
                                          {badgeLabel}
                                        </span>
                                      )}
                                    </span>
                                  </td>
                                </>
                              )}
                              {/* Source A cells: per-row when many-A, rowSpan on first when many-B or 1:1 */}
                              {isManyA ? (
                                colsA.map((col, ci) => (
                                  <td
                                    key={`a-${col}`}
                                    className={`px-3 py-2.5 text-sm text-gray-700 align-top ${ci === colsA.length - 1 ? "border-r border-gray-200" : ""}`}
                                  >
                                    {rowA ? formatCellValue(rowA[col], col) : "—"}
                                  </td>
                                ))
                              ) : (
                                isFirst && colsA.map((col, ci) => (
                                  <td
                                    key={`a-${col}`}
                                    className={`px-3 py-2.5 text-sm text-gray-700 align-top ${ci === colsA.length - 1 ? "border-r border-gray-200" : ""}`}
                                    rowSpan={subRowCount}
                                  >
                                    {rowA ? formatCellValue(rowA[col], col) : "—"}
                                  </td>
                                ))
                              )}
                              {/* Source B cells: per-row when many-B, rowSpan on first when many-A or 1:1 */}
                              {isManyB ? (
                                colsB.map((col) => (
                                  <Td key={`b-${col}`}>{rowB ? formatCellValue(rowB[col], col) : "—"}</Td>
                                ))
                              ) : (
                                isFirst && colsB.map((col) => (
                                  <td
                                    key={`b-${col}`}
                                    className="px-3 py-2.5 text-sm text-gray-700 align-top"
                                    rowSpan={subRowCount}
                                  >
                                    {rowB ? formatCellValue(rowB[col], col) : "—"}
                                  </td>
                                ))
                              )}
                            </tr>
                          )
                        })}
                      </Fragment>
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
                These {sourceALabel} rows have no match. Click a row to pick one or more {sourceBLabel} orphans whose amounts sum to the target.
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
                      <Th className="w-32">Match</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedAIndices.map((aIdx, i) => {
                      const row = sourceARows[aIdx]
                      const isExpanded = expandedRow === aIdx
                      const targetAmt = row ? getAmountFromRow(row, allColsA) : null
                      return (
                        <Fragment key={aIdx}>
                          <tr
                            className={`border-b border-gray-100 cursor-pointer ${isExpanded ? "bg-amber-50" : "hover:bg-amber-50/50"}`}
                            onClick={() => toggleExpandedRow(aIdx)}
                          >
                            <Td className="text-center">
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                            </Td>
                            <Td className="text-center text-gray-400">{i + 1}</Td>
                            {colsA.map((col) => (
                              <Td key={col}>{row ? formatCellValue(row[col], col) : "—"}</Td>
                            ))}
                            <Td>
                              <span className="text-xs text-orange-600 font-medium">
                                {isComplete ? "—" : (isExpanded ? "Selecting…" : "Pick orphans")}
                              </span>
                            </Td>
                          </tr>
                          {/* Expanded multi-select orphan picker */}
                          {isExpanded && !isComplete && (
                            <tr>
                              <td colSpan={colsA.length + 3} className="bg-orange-50/40 px-6 py-3 border-b border-orange-200">
                                <OrphanMultiMatchPicker
                                  targetAIdx={aIdx}
                                  targetAmount={targetAmt}
                                  unmatchedBIndices={unmatchedBIndices}
                                  sourceBRows={sourceBRows}
                                  colsB={colsB}
                                  allColsB={allColsB}
                                  sourceBLabel={sourceBLabel}
                                  selected={selectedOrphans}
                                  onToggle={(bIdx) => {
                                    setSelectedOrphans((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(bIdx)) next.delete(bIdx)
                                      else next.add(bIdx)
                                      return next
                                    })
                                  }}
                                  onClear={() => setSelectedOrphans(new Set())}
                                  filter={orphanFilter}
                                  onFilterChange={setOrphanFilter}
                                  onSubmit={(idxs) => handleManualMatch(aIdx, idxs)}
                                  isMatching={
                                    matchingPair !== null &&
                                    matchingPair.startsWith(`${aIdx}-`)
                                  }
                                />
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
                These {sourceBLabel} rows have no corresponding entry in {sourceALabel}. Click a row to pick an unmatched {sourceALabel} target (optionally combining with other orphans).
              </p>
              {ignoredOrphans.size > 0 && (
                <p className="text-xs text-gray-400 mb-2">{ignoredOrphans.size} orphan(s) ignored</p>
              )}
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-blue-50 border-b border-blue-200 sticky top-0">
                    <tr>
                      <Th className="w-8">{""}</Th>
                      <Th className="w-10 text-center">#</Th>
                      {colsB.map((col) => (
                        <Th key={col}>{sourceBLabel} {col.replace(/_/g, " ")}</Th>
                      ))}
                      <Th className="w-32">Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedBIndices.map((bIdx, i) => {
                      const row = sourceBRows[bIdx]
                      const isExpanded = expandedRow === bIdx
                      return (
                        <Fragment key={bIdx}>
                          <tr
                            className={`border-b border-gray-100 cursor-pointer ${isExpanded ? "bg-blue-50" : "hover:bg-blue-50/50"}`}
                            onClick={() => !isComplete && toggleExpandedOrphan(bIdx)}
                          >
                            <Td className="text-center">
                              {!isComplete && (
                                isExpanded
                                  ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                              )}
                            </Td>
                            <Td className="text-center text-gray-400">{i + 1}</Td>
                            {colsB.map((col) => (
                              <Td key={col}>{row ? formatCellValue(row[col], col) : "—"}</Td>
                            ))}
                            <Td>
                              {isComplete ? (
                                <span className="text-xs text-gray-400">—</span>
                              ) : isExpanded ? (
                                <span className="text-xs text-blue-600 font-medium">Selecting…</span>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setIgnoredOrphans((prev) => { const next = new Set(prev); next.add(bIdx); return next })
                                  }}
                                  className="text-xs text-gray-400 hover:text-red-500"
                                >
                                  Ignore
                                </button>
                              )}
                            </Td>
                          </tr>
                          {isExpanded && !isComplete && (
                            <tr>
                              <td colSpan={colsB.length + 3} className="bg-blue-50/40 px-6 py-3 border-b border-blue-200">
                                <UnmatchedAPicker
                                  targetBIdx={bIdx}
                                  targetAmount={row ? getAmountFromRow(row, allColsB) : null}
                                  unmatchedAIndices={unmatchedAIndices}
                                  sourceARows={sourceARows}
                                  colsA={colsA}
                                  allColsA={allColsA}
                                  sourceALabel={sourceALabel}
                                  selected={selectedOrphans}
                                  onToggle={(aIdx) => {
                                    setSelectedOrphans((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(aIdx)) next.delete(aIdx)
                                      else next.add(aIdx)
                                      return next
                                    })
                                  }}
                                  onClear={() => setSelectedOrphans(new Set())}
                                  filter={orphanFilter}
                                  onFilterChange={setOrphanFilter}
                                  onSubmit={(aIdxs) => handleManualMatch(aIdxs, bIdx)}
                                  isMatching={
                                    matchingPair !== null &&
                                    matchingPair.endsWith(`-${bIdx}`)
                                  }
                                />
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

// ── Multi-orphan match picker ─────────────────────────────────────────

const MULTI_MATCH_TOLERANCE = 1 // dollars

/**
 * Per-row picker shown when an orphan row is expanded in the Orphans tab.
 * Mirrors OrphanMultiMatchPicker exactly: single multi-select list, filter,
 * running total vs target, Match button. Here the list is unmatched Source A
 * rows, and selecting many creates an N:1 (many-A-to-one-B) match.
 */
interface UnmatchedAPickerProps {
  targetBIdx: number
  targetAmount: number | null
  unmatchedAIndices: number[]
  sourceARows: Record<string, any>[]
  colsA: string[]
  allColsA: string[]
  sourceALabel: string
  selected: Set<number>
  onToggle: (aIdx: number) => void
  onClear: () => void
  filter: string
  onFilterChange: (v: string) => void
  onSubmit: (aIdxs: number[]) => void
  isMatching: boolean
}

function UnmatchedAPicker({
  targetAmount,
  unmatchedAIndices,
  sourceARows,
  colsA,
  allColsA,
  sourceALabel,
  selected,
  onToggle,
  onClear,
  filter,
  onFilterChange,
  onSubmit,
  isMatching,
}: UnmatchedAPickerProps) {
  const filterLower = filter.trim().toLowerCase()

  const visibleRows = useMemo(() => {
    if (!filterLower) return unmatchedAIndices
    return unmatchedAIndices.filter((aIdx) => {
      const row = sourceARows[aIdx]
      if (!row) return false
      return Object.values(row).some((v) =>
        v !== null && v !== undefined && String(v).toLowerCase().includes(filterLower)
      )
    })
  }, [unmatchedAIndices, sourceARows, filterLower])

  const selectedSum = useMemo(() => {
    let sum = 0
    for (const aIdx of selected) {
      const amt = getAmountFromRow(sourceARows[aIdx] || {}, allColsA)
      if (amt !== null) sum += amt
    }
    return Math.round(sum * 100) / 100
  }, [selected, sourceARows, allColsA])

  // Match both direct and sign-inverted sums (bank credit vs GL debit)
  const diffDirect = targetAmount === null ? null : Math.round((targetAmount - selectedSum) * 100) / 100
  const diffInverted = targetAmount === null ? null : Math.round((targetAmount + selectedSum) * 100) / 100
  const bestDiff =
    diffDirect === null || diffInverted === null
      ? null
      : Math.abs(diffDirect) <= Math.abs(diffInverted) ? diffDirect : diffInverted

  const withinTolerance = bestDiff !== null && Math.abs(bestDiff) <= MULTI_MATCH_TOLERANCE
  const canSubmit =
    selected.size > 0 &&
    !isMatching &&
    (targetAmount === null || withinTolerance)

  const selectedArr = useMemo(() => Array.from(selected), [selected])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium text-gray-600">
          Select one or more unmatched {sourceALabel} rows:
        </p>
        <input
          type="text"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder={`Filter ${sourceALabel} rows…`}
          className="text-xs px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 w-56"
        />
      </div>

      {unmatchedAIndices.length === 0 ? (
        <div className="text-xs text-gray-500 py-2 italic">
          No unmatched {sourceALabel} rows available to match.
        </div>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto bg-white rounded-lg border border-gray-200">
            {visibleRows.length === 0 ? (
              <div className="text-xs text-gray-500 p-3 italic">No rows match this filter.</div>
            ) : (
              visibleRows.map((aIdx) => {
                const aRow = sourceARows[aIdx]
                const isChecked = selected.has(aIdx)
                return (
                  <label
                    key={aIdx}
                    className={`flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer text-sm ${isChecked ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggle(aIdx)}
                      className="rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                    />
                    <div className="flex items-center gap-4 flex-wrap flex-1">
                      {colsA.map((col) => (
                        <span key={col} className="text-gray-700">
                          <span className="text-gray-400 text-xs mr-1">{col}:</span>
                          {aRow ? formatCellValue(aRow[col], col) : "—"}
                        </span>
                      ))}
                    </div>
                  </label>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <div className="text-xs text-gray-600 flex items-center gap-4 flex-wrap">
              <span>
                Selected: <span className="font-semibold text-gray-900">{selected.size}</span>
              </span>
              <span>
                Sum: <span className="font-semibold text-gray-900">{formatDollar(selectedSum)}</span>
              </span>
              {targetAmount !== null && (
                <>
                  <span>
                    Target: <span className="font-semibold text-gray-900">{formatDollar(targetAmount)}</span>
                  </span>
                  <span className={withinTolerance ? "text-green-700" : "text-red-600"}>
                    Diff: <span className="font-semibold">{formatDollar(bestDiff ?? 0)}</span>
                    {withinTolerance && selected.size > 0 && (
                      <span className="ml-1 text-green-600">✓ within ${MULTI_MATCH_TOLERANCE} tolerance</span>
                    )}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <Button
                  onClick={onClear}
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={isMatching}
                >
                  Clear
                </Button>
              )}
              <Button
                onClick={() => onSubmit(selectedArr)}
                size="sm"
                variant="outline"
                className={`text-xs border-green-300 text-green-700 hover:bg-green-50 ${!canSubmit ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!canSubmit}
                title={
                  selected.size === 0
                    ? `Select at least one ${sourceALabel} row`
                    : !withinTolerance && targetAmount !== null
                      ? `Sum differs from target by more than $${MULTI_MATCH_TOLERANCE}`
                      : ""
                }
              >
                {isMatching
                  ? "Matching…"
                  : selected.size > 1
                    ? `Match ${selected.size} rows`
                    : "Match"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface OrphanMultiMatchPickerProps {
  targetAIdx: number
  targetAmount: number | null
  unmatchedBIndices: number[]
  sourceBRows: Record<string, any>[]
  colsB: string[]
  allColsB: string[]
  sourceBLabel: string
  selected: Set<number>
  onToggle: (bIdx: number) => void
  onClear: () => void
  filter: string
  onFilterChange: (v: string) => void
  onSubmit: (idxs: number[]) => void
  isMatching: boolean
}

function OrphanMultiMatchPicker({
  targetAmount,
  unmatchedBIndices,
  sourceBRows,
  colsB,
  allColsB,
  sourceBLabel,
  selected,
  onToggle,
  onClear,
  filter,
  onFilterChange,
  onSubmit,
  isMatching,
}: OrphanMultiMatchPickerProps) {
  const filterLower = filter.trim().toLowerCase()

  const visibleOrphans = useMemo(() => {
    if (!filterLower) return unmatchedBIndices
    return unmatchedBIndices.filter((bIdx) => {
      const row = sourceBRows[bIdx]
      if (!row) return false
      return Object.values(row).some((v) =>
        v !== null && v !== undefined && String(v).toLowerCase().includes(filterLower)
      )
    })
  }, [unmatchedBIndices, sourceBRows, filterLower])

  const selectedSum = useMemo(() => {
    let sum = 0
    for (const bIdx of selected) {
      const amt = getAmountFromRow(sourceBRows[bIdx] || {}, allColsB)
      if (amt !== null) sum += amt
    }
    return Math.round(sum * 100) / 100
  }, [selected, sourceBRows, allColsB])

  // Match both direct and sign-inverted sums (e.g. bank debit vs GL credit)
  const diffDirect = targetAmount === null ? null : Math.round((targetAmount - selectedSum) * 100) / 100
  const diffInverted = targetAmount === null ? null : Math.round((targetAmount + selectedSum) * 100) / 100
  const bestDiff =
    diffDirect === null || diffInverted === null
      ? null
      : (Math.abs(diffDirect) <= Math.abs(diffInverted) ? diffDirect : diffInverted)

  const withinTolerance = bestDiff !== null && Math.abs(bestDiff) <= MULTI_MATCH_TOLERANCE
  const canSubmit =
    selected.size > 0 &&
    !isMatching &&
    (targetAmount === null || withinTolerance)

  const selectedArr = useMemo(() => Array.from(selected), [selected])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium text-gray-600">
          Select one or more {sourceBLabel} orphans:
        </p>
        <input
          type="text"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter orphans…"
          className="text-xs px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-400 w-56"
        />
      </div>

      {unmatchedBIndices.length === 0 ? (
        <div className="text-xs text-gray-500 py-2 italic">
          No orphans available to match.
        </div>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto bg-white rounded-lg border border-gray-200">
            {visibleOrphans.length === 0 ? (
              <div className="text-xs text-gray-500 p-3 italic">No orphans match this filter.</div>
            ) : (
              visibleOrphans.map((bIdx) => {
                const bRow = sourceBRows[bIdx]
                const isChecked = selected.has(bIdx)
                return (
                  <label
                    key={bIdx}
                    className={`flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer text-sm ${isChecked ? "bg-orange-50" : "hover:bg-gray-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggle(bIdx)}
                      className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                    <div className="flex items-center gap-4 flex-wrap flex-1">
                      {colsB.map((col) => (
                        <span key={col} className="text-gray-700">
                          <span className="text-gray-400 text-xs mr-1">{col}:</span>
                          {bRow ? formatCellValue(bRow[col], col) : "—"}
                        </span>
                      ))}
                    </div>
                  </label>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <div className="text-xs text-gray-600 flex items-center gap-4 flex-wrap">
              <span>
                Selected: <span className="font-semibold text-gray-900">{selected.size}</span>
              </span>
              <span>
                Sum: <span className="font-semibold text-gray-900">{formatDollar(selectedSum)}</span>
              </span>
              {targetAmount !== null && (
                <>
                  <span>
                    Target: <span className="font-semibold text-gray-900">{formatDollar(targetAmount)}</span>
                  </span>
                  <span className={withinTolerance ? "text-green-700" : "text-red-600"}>
                    Diff: <span className="font-semibold">{formatDollar(bestDiff ?? 0)}</span>
                    {withinTolerance && selected.size > 0 && (
                      <span className="ml-1 text-green-600">✓ within ${MULTI_MATCH_TOLERANCE} tolerance</span>
                    )}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <Button
                  onClick={onClear}
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={isMatching}
                >
                  Clear
                </Button>
              )}
              <Button
                onClick={() => onSubmit(selectedArr)}
                size="sm"
                variant="outline"
                className={`text-xs border-green-300 text-green-700 hover:bg-green-50 ${!canSubmit ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!canSubmit}
                title={
                  selected.size === 0
                    ? "Select at least one orphan"
                    : !withinTolerance && targetAmount !== null
                      ? `Sum differs from target by more than $${MULTI_MATCH_TOLERANCE}`
                      : ""
                }
              >
                {isMatching
                  ? "Matching…"
                  : selected.size > 1
                    ? `Match ${selected.size} orphans`
                    : "Match"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
