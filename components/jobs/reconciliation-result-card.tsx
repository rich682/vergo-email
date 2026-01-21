"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  FileSpreadsheet, 
  Play, 
  Loader2, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronUp,
  Clock
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface Discrepancy {
  type: "missing_in_doc1" | "missing_in_doc2" | "value_mismatch"
  keyColumn: string
  keyValue: string
  details: string
}

interface Reconciliation {
  id: string
  document1Name: string
  document2Name: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  summary?: string | null
  matchedCount?: number | null
  unmatchedCount?: number | null
  totalRows?: number | null
  discrepancies?: Discrepancy[] | null
  errorMessage?: string | null
  createdAt: string
  updatedAt?: string
  createdBy?: {
    name?: string
    email?: string
  }
}

interface ReconciliationResultCardProps {
  reconciliation: Reconciliation
  jobId: string
  onUpdate?: (updated: Reconciliation) => void
}

export function ReconciliationResultCard({
  reconciliation,
  jobId,
  onUpdate
}: ReconciliationResultCardProps) {
  const [processing, setProcessing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleProcess = async () => {
    setProcessing(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/task-instances/${jobId}/reconciliations/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reconciliationId: reconciliation.id }),
          credentials: "include"
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Processing failed")
      }

      const data = await response.json()
      
      // Update local state with results
      onUpdate?.({
        ...reconciliation,
        status: "COMPLETED",
        summary: data.summary,
        matchedCount: data.matchedCount,
        unmatchedCount: data.unmatchedCount,
        totalRows: data.totalRows,
        discrepancies: data.discrepancies
      })

      setExpanded(true)
    } catch (err: any) {
      setError(err.message || "Failed to process reconciliation")
      onUpdate?.({
        ...reconciliation,
        status: "FAILED",
        errorMessage: err.message
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleExport = () => {
    window.location.href = `/api/task-instances/${jobId}/reconciliations/${reconciliation.id}/export`
  }

  const getStatusIcon = () => {
    switch (reconciliation.status) {
      case "PENDING":
        return <Clock className="w-4 h-4 text-amber-500" />
      case "PROCESSING":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case "COMPLETED":
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case "FAILED":
        return <XCircle className="w-4 h-4 text-red-500" />
    }
  }

  const getStatusColor = () => {
    switch (reconciliation.status) {
      case "PENDING":
        return "bg-amber-50 text-amber-700 border-amber-200"
      case "PROCESSING":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "COMPLETED":
        return "bg-green-50 text-green-700 border-green-200"
      case "FAILED":
        return "bg-red-50 text-red-700 border-red-200"
    }
  }

  const matchRate = reconciliation.totalRows && reconciliation.matchedCount != null
    ? (((reconciliation.matchedCount ?? 0) / reconciliation.totalRows) * 100).toFixed(1)
    : null

  const discrepancies = reconciliation.discrepancies || []

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-green-600" />
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor()}`}>
                  {getStatusIcon()}
                  {reconciliation.status}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(reconciliation.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {reconciliation.document1Name} vs {reconciliation.document2Name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {reconciliation.status === "PENDING" && (
              <Button
                size="sm"
                onClick={handleProcess}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" />
                    Process
                  </>
                )}
              </Button>
            )}

            {reconciliation.status === "COMPLETED" && (
              <>
                <Button size="sm" variant="outline" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </>
            )}

            {reconciliation.status === "FAILED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleProcess}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-1" />
                )}
                Retry
              </Button>
            )}
          </div>
        </div>

        {/* Error message */}
        {(error || reconciliation.errorMessage) && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error || reconciliation.errorMessage}
          </div>
        )}

        {/* Summary for completed reconciliations */}
        {reconciliation.status === "COMPLETED" && reconciliation.summary && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">{reconciliation.summary}</p>
          </div>
        )}

        {/* Stats for completed reconciliations */}
        {reconciliation.status === "COMPLETED" && (
          <div className="mt-3 grid grid-cols-4 gap-3">
            <div className="text-center p-2 bg-green-50 rounded">
              <div className="text-lg font-semibold text-green-700">
                {reconciliation.matchedCount ?? 0}
              </div>
              <div className="text-xs text-green-600">Matched</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded">
              <div className="text-lg font-semibold text-red-700">
                {reconciliation.unmatchedCount ?? 0}
              </div>
              <div className="text-xs text-red-600">Discrepancies</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-lg font-semibold text-gray-700">
                {reconciliation.totalRows ?? 0}
              </div>
              <div className="text-xs text-gray-600">Total Rows</div>
            </div>
            <div className="text-center p-2 bg-blue-50 rounded">
              <div className="text-lg font-semibold text-blue-700">
                {matchRate ? `${matchRate}%` : "N/A"}
              </div>
              <div className="text-xs text-blue-600">Match Rate</div>
            </div>
          </div>
        )}
      </div>

      {/* Expanded discrepancies */}
      {expanded && reconciliation.status === "COMPLETED" && discrepancies.length > 0 && (
        <div className="border-t">
          <div className="p-3 bg-gray-50 border-b">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Discrepancies ({discrepancies.length})
            </h4>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Key</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {discrepancies.slice(0, 50).map((d, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        d.type === "missing_in_doc1" 
                          ? "bg-orange-100 text-orange-700" 
                          : d.type === "missing_in_doc2"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {d.type === "missing_in_doc1" && "Missing Doc 1"}
                        {d.type === "missing_in_doc2" && "Missing Doc 2"}
                        {d.type === "value_mismatch" && "Mismatch"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {d.keyValue}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-md truncate">
                      {d.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {discrepancies.length > 50 && (
              <div className="p-2 bg-gray-50 text-center text-xs text-gray-500">
                Showing first 50 of {discrepancies.length} discrepancies. Export to see all.
              </div>
            )}
          </div>
        </div>
      )}

      {expanded && reconciliation.status === "COMPLETED" && discrepancies.length === 0 && (
        <div className="border-t p-4 text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No discrepancies found. Documents match perfectly!</p>
        </div>
      )}
    </div>
  )
}
