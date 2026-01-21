"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  CheckCircle,
  AlertCircle,
  Plus,
  RefreshCw,
  Minus,
  ArrowRight,
} from "lucide-react"

interface ImportSummary {
  rowsAdded: number
  rowsUpdated: number
  rowsRemoved: number
  rowsUnchanged: number
  errors: Array<{ row: number; error: string }>
  filename?: string
  importedAt?: string
}

interface ImportSummaryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: ImportSummary | null
  onViewChanges?: () => void
}

export function ImportSummaryModal({
  open,
  onOpenChange,
  summary,
  onViewChanges,
}: ImportSummaryModalProps) {
  if (!summary) return null

  const hasErrors = summary.errors.length > 0
  const totalProcessed = summary.rowsAdded + summary.rowsUpdated + summary.rowsUnchanged

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasErrors ? (
              <AlertCircle className="w-5 h-5 text-amber-500" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
            Import {hasErrors ? "Completed with Warnings" : "Successful"}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <div className="p-2 bg-green-100 rounded-full">
                <Plus className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <div className="text-lg font-semibold text-green-700">
                  {summary.rowsAdded}
                </div>
                <div className="text-xs text-green-600">Rows Added</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
              <div className="p-2 bg-orange-100 rounded-full">
                <RefreshCw className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <div className="text-lg font-semibold text-orange-700">
                  {summary.rowsUpdated}
                </div>
                <div className="text-xs text-orange-600">Rows Updated</div>
              </div>
            </div>

            {summary.rowsRemoved > 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <div className="p-2 bg-red-100 rounded-full">
                  <Minus className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-red-700">
                    {summary.rowsRemoved}
                  </div>
                  <div className="text-xs text-red-600">Rows Removed</div>
                </div>
              </div>
            )}

            {summary.rowsUnchanged > 0 && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="p-2 bg-gray-100 rounded-full">
                  <CheckCircle className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-700">
                    {summary.rowsUnchanged}
                  </div>
                  <div className="text-xs text-gray-600">Unchanged</div>
                </div>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="text-center text-sm text-gray-500">
            Total: {totalProcessed} rows processed
            {summary.filename && (
              <span className="block text-xs mt-1">
                from {summary.filename}
              </span>
            )}
          </div>

          {/* Errors */}
          {hasErrors && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium text-sm">
                  {summary.errors.length} row{summary.errors.length > 1 ? "s" : ""} had errors
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {summary.errors.slice(0, 10).map((err, i) => (
                  <div key={i} className="text-xs text-red-600">
                    Row {err.row + 1}: {err.error}
                  </div>
                ))}
                {summary.errors.length > 10 && (
                  <div className="text-xs text-red-500 italic">
                    ...and {summary.errors.length - 10} more errors
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onViewChanges && (summary.rowsUpdated > 0 || summary.rowsAdded > 0) && (
            <Button onClick={onViewChanges}>
              View Changes
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
