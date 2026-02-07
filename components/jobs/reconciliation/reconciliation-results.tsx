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

function getAmountDisplay(row: Record<string, any>): string {
  // Look for any key with "amount" in the name
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("amount") || key.toLowerCase().includes("debit") || key.toLowerCase().includes("credit")) {
      const val = row[key]
      if (val !== null && val !== undefined && val !== "") {
        return typeof val === "number" ? `$${val.toFixed(2)}` : `$${val}`
      }
    }
  }
  return ""
}

function getDescriptionDisplay(row: Record<string, any>): string {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("description") || key.toLowerCase().includes("memo") || key.toLowerCase().includes("text")) {
      return String(row[key] || "").substring(0, 60)
    }
  }
  // Fallback: join all text values
  return Object.values(row)
    .filter((v) => typeof v === "string" && v.length > 3)
    .join(", ")
    .substring(0, 60)
}

function getDateDisplay(row: Record<string, any>): string {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("date")) {
      const val = row[key]
      if (!val) return ""
      try {
        const d = new Date(val)
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      } catch {
        return String(val).substring(0, 10)
      }
    }
  }
  return ""
}

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
  const [view, setView] = useState<"summary" | "matched" | "exceptions">("summary")
  const [completing, setCompleting] = useState(false)
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null)

  const isComplete = status === "COMPLETE"
  const matchRate = totalSourceA > 0 ? Math.round((matchedCount / totalSourceA) * 100) : 0

  const exceptionsList = useMemo(() => {
    return Object.entries(exceptions || {}).map(([key, val]) => ({
      key,
      ...val,
    }))
  }, [exceptions])

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
    <div className="space-y-6">
      {/* Summary Bar */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard label="Source A" value={`${totalSourceA} rows`} sublabel={sourceALabel} />
        <SummaryCard label="Source B" value={`${totalSourceB} rows`} sublabel={sourceBLabel} />
        <SummaryCard
          label="Matched"
          value={`${matchedCount}`}
          sublabel={`${matchRate}% match rate`}
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
          value={`$${Math.abs(variance).toFixed(2)}`}
          sublabel={variance === 0 ? "Balanced" : variance > 0 ? "Over" : "Under"}
          color={variance === 0 ? "text-green-600" : "text-red-600"}
        />
      </div>

      {/* Status/Completion */}
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
              Review complete. {exceptionCount > 0 ? `${exceptionCount} exceptions need resolution.` : "No exceptions found."}
            </p>
          </div>
          <Button onClick={handleComplete} disabled={completing} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
            {completing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
            Sign Off
          </Button>
        </div>
      )}

      {/* View Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        {(["summary", "matched", "exceptions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              view === tab
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "summary" ? "Summary" : tab === "matched" ? `Matched (${matchedCount})` : `Exceptions (${exceptionCount})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {view === "summary" && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-xs font-medium text-gray-500 grid grid-cols-5">
              <span>Method</span>
              <span>Count</span>
              <span>% of Total</span>
              <span>Avg Confidence</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-gray-100">
              {/* Exact matches */}
              <div className="px-4 py-2.5 text-sm grid grid-cols-5">
                <span className="text-gray-900">Exact Match</span>
                <span className="text-gray-600">{matchResults.matched.filter((m) => m.method === "exact").length}</span>
                <span className="text-gray-600">
                  {totalSourceA > 0 ? Math.round((matchResults.matched.filter((m) => m.method === "exact").length / totalSourceA) * 100) : 0}%
                </span>
                <span className="text-gray-600">100%</span>
                <span className="text-green-600 font-medium">Verified</span>
              </div>
              {/* AI matches */}
              <div className="px-4 py-2.5 text-sm grid grid-cols-5">
                <span className="text-gray-900">AI Fuzzy Match</span>
                <span className="text-gray-600">{matchResults.matched.filter((m) => m.method === "fuzzy_ai").length}</span>
                <span className="text-gray-600">
                  {totalSourceA > 0 ? Math.round((matchResults.matched.filter((m) => m.method === "fuzzy_ai").length / totalSourceA) * 100) : 0}%
                </span>
                <span className="text-gray-600">
                  {matchResults.matched.filter((m) => m.method === "fuzzy_ai").length > 0
                    ? Math.round(
                        matchResults.matched
                          .filter((m) => m.method === "fuzzy_ai")
                          .reduce((sum, m) => sum + m.confidence, 0) /
                          matchResults.matched.filter((m) => m.method === "fuzzy_ai").length
                      ) + "%"
                    : "N/A"}
                </span>
                <span className="text-amber-600 font-medium">Review</span>
              </div>
              {/* Unmatched */}
              <div className="px-4 py-2.5 text-sm grid grid-cols-5">
                <span className="text-gray-900">Unmatched / Exception</span>
                <span className="text-gray-600">{exceptionCount}</span>
                <span className="text-gray-600">{totalSourceA > 0 ? Math.round((exceptionCount / totalSourceA) * 100) : 0}%</span>
                <span className="text-gray-600">N/A</span>
                <span className="text-red-600 font-medium">{exceptionCount > 0 ? "Needs Review" : "Clean"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "matched" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-xs font-medium text-gray-500 grid grid-cols-7">
            <span>{sourceALabel} Date</span>
            <span>{sourceALabel} Desc</span>
            <span>{sourceALabel} Amount</span>
            <span>{sourceBLabel} Date</span>
            <span>{sourceBLabel} Desc</span>
            <span>{sourceBLabel} Amount</span>
            <span>Method</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {matchResults.matched.map((match, i) => {
              const rowA = sourceARows[match.sourceAIdx]
              const rowB = sourceBRows[match.sourceBIdx]
              const isExpanded = expandedMatch === i
              return (
                <div key={i}>
                  <div
                    className="px-4 py-2 text-xs grid grid-cols-7 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedMatch(isExpanded ? null : i)}
                  >
                    <span className="text-gray-600">{getDateDisplay(rowA)}</span>
                    <span className="text-gray-900 truncate">{getDescriptionDisplay(rowA)}</span>
                    <span className="text-gray-700 font-medium">{getAmountDisplay(rowA)}</span>
                    <span className="text-gray-600">{getDateDisplay(rowB)}</span>
                    <span className="text-gray-900 truncate">{getDescriptionDisplay(rowB)}</span>
                    <span className="text-gray-700 font-medium">{getAmountDisplay(rowB)}</span>
                    <span className="flex items-center gap-1">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        match.method === "exact" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {match.method === "exact" ? "Exact" : `AI ${match.confidence}%`}
                      </span>
                      {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                    </span>
                  </div>
                  {isExpanded && match.reasoning && (
                    <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 border-t border-gray-100">
                      AI reasoning: {match.reasoning}
                    </div>
                  )}
                </div>
              )
            })}
            {matchResults.matched.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No matched items</div>
            )}
          </div>
        </div>
      )}

      {view === "exceptions" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-xs font-medium text-gray-500 grid grid-cols-7">
            <span>Source</span>
            <span>Date</span>
            <span>Description</span>
            <span>Amount</span>
            <span>Category</span>
            <span>Reason</span>
            <span>Resolution</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {exceptionsList.map((exc) => {
              const rows = exc.source === "A" ? sourceARows : sourceBRows
              const row = rows[exc.rowIdx]
              const catInfo = CATEGORY_LABELS[exc.category] || CATEGORY_LABELS.other

              return (
                <div key={exc.key} className="px-4 py-2 text-xs grid grid-cols-7 hover:bg-gray-50">
                  <span className={`font-medium ${exc.source === "A" ? "text-blue-600" : "text-indigo-600"}`}>
                    {exc.source === "A" ? sourceALabel : sourceBLabel}
                  </span>
                  <span className="text-gray-600">{row ? getDateDisplay(row) : ""}</span>
                  <span className="text-gray-900 truncate">{row ? getDescriptionDisplay(row) : ""}</span>
                  <span className="text-gray-700 font-medium">{row ? getAmountDisplay(row) : ""}</span>
                  <span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${catInfo.color}`}>
                      {catInfo.label}
                    </span>
                  </span>
                  <span className="text-gray-500 truncate">{exc.reason}</span>
                  <span>
                    {exc.resolution ? (
                      <span className="text-green-600 text-[10px] font-medium">{exc.resolution}</span>
                    ) : isComplete ? (
                      <span className="text-gray-400 text-[10px]">N/A</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleResolveException(exc.key, "approved")}
                          disabled={resolvingKey === exc.key}
                          className="text-[10px] text-green-600 hover:text-green-700 underline"
                        >
                          Approve
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => handleResolveException(exc.key, "flagged")}
                          disabled={resolvingKey === exc.key}
                          className="text-[10px] text-red-600 hover:text-red-700 underline"
                        >
                          Flag
                        </button>
                      </div>
                    )}
                  </span>
                </div>
              )
            })}
            {exceptionsList.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No exceptions - clean reconciliation!</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sublabel, color }: { label: string; value: string; sublabel: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${color || "text-gray-900"}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sublabel}</p>
    </div>
  )
}
