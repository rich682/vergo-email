"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RefreshCw, Calendar, FileSpreadsheet, Plus, Minus, CheckCircle2 } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"

interface DiffSummary {
  addedCount: number
  removedCount: number
  addedIdentities: string[]
  removedIdentities: string[]
}

interface DatasetSnapshot {
  id: string
  periodLabel: string | null
  periodStart: string | null
  periodEnd: string | null
  version: number
  isLatest: boolean
  rows: Record<string, unknown>[]
  rowCount: number
  diffSummary: DiffSummary | null
  sourceFilename: string | null
  createdAt: string
}

interface SnapshotDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetId: string
  snapshotId: string
}

export function SnapshotDetailModal({
  open,
  onOpenChange,
  datasetId,
  snapshotId,
}: SnapshotDetailModalProps) {
  const [snapshot, setSnapshot] = useState<DatasetSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const pageSize = 50

  useEffect(() => {
    if (!open) return

    const fetchSnapshot = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/datasets/${datasetId}/snapshots/${snapshotId}`,
          { credentials: "include" }
        )
        if (!response.ok) throw new Error("Failed to fetch snapshot")
        const data = await response.json()
        setSnapshot(data.snapshot)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchSnapshot()
  }, [open, datasetId, snapshotId])

  if (!open) return null

  const rows = snapshot?.rows || []
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  const paginatedRows = rows.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(rows.length / pageSize)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {snapshot?.periodLabel || "Snapshot Details"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600">{error}</p>
          </div>
        ) : snapshot ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Snapshot Info */}
            <div className="flex items-center gap-6 pb-4 border-b border-gray-100">
              {snapshot.periodStart && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(snapshot.periodStart), "MMM d, yyyy")}
                  {snapshot.periodEnd && (
                    <> - {format(new Date(snapshot.periodEnd), "MMM d, yyyy")}</>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileSpreadsheet className="w-4 h-4" />
                {snapshot.rowCount.toLocaleString()} rows
              </div>
              {snapshot.isLatest && (
                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                  Latest
                </span>
              )}
              {snapshot.version > 1 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                  v{snapshot.version}
                </span>
              )}

              {/* Diff Summary */}
              {snapshot.diffSummary && (
                <div className="flex items-center gap-3 ml-auto">
                  {snapshot.diffSummary.addedCount > 0 && (
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <Plus className="w-4 h-4" />
                      {snapshot.diffSummary.addedCount} added
                    </span>
                  )}
                  {snapshot.diffSummary.removedCount > 0 && (
                    <span className="flex items-center gap-1 text-sm text-red-600">
                      <Minus className="w-4 h-4" />
                      {snapshot.diffSummary.removedCount} removed
                    </span>
                  )}
                  {snapshot.diffSummary.addedCount === 0 && snapshot.diffSummary.removedCount === 0 && (
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <CheckCircle2 className="w-4 h-4" />
                      No changes from prior
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-auto mt-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRows.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">
                        {page * pageSize + index + 1}
                      </td>
                      {columns.map((col) => (
                        <td key={col} className="px-3 py-2 text-gray-900">
                          {String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, rows.length)} of {rows.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-500">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Footer Info */}
            <div className="pt-4 text-xs text-gray-400">
              Uploaded {formatDistanceToNow(new Date(snapshot.createdAt), { addSuffix: true })}
              {snapshot.sourceFilename && <> from {snapshot.sourceFilename}</>}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
