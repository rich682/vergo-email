"use client"

import { useState, useEffect, Suspense } from "react"
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react"
import Link from "next/link"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TRASH_MODELS, type TrashModelKey } from "@/lib/trash"

interface TrashItem {
  id: string
  name: string
  deletedAt: string
  deletedById: string | null
  deletedBy: { id: string; name: string | null; email: string } | null
}

interface DeletedRowBatch {
  databaseId: string
  databaseName: string
  batchIndex: number
  rowCount: number
  deletedAt: string
  deletedById: string
  deletedByName: string | null
}

type TrashData = Record<TrashModelKey, TrashItem[]> & { deletedRows?: DeletedRowBatch[] }

function TrashContent() {
  const [data, setData] = useState<TrashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; model: TrashModelKey; item: TrashItem } | null>(null)
  const [rowDeleteDialog, setRowDeleteDialog] = useState<{ open: boolean; batch: DeletedRowBatch } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [restoringRow, setRestoringRow] = useState<string | null>(null)

  useEffect(() => {
    fetchTrash()
  }, [])

  const fetchTrash = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/trash")
      if (response.ok) {
        setData(await response.json())
      } else if (response.status === 403) {
        setMessage({ type: "error", text: "Only admins can view the trash." })
      }
    } catch (error) {
      console.error("Error fetching trash:", error)
      setMessage({ type: "error", text: "Failed to load trash items." })
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (model: TrashModelKey, item: TrashItem) => {
    try {
      setRestoring(item.id)
      setMessage(null)
      const response = await fetch(`/api/trash/${model}/${item.id}/restore`, { method: "POST" })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Failed to restore item")
      }
      setMessage({ type: "success", text: `"${item.name}" has been restored.` })
      setTimeout(() => setMessage(null), 5000)
      fetchTrash()
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to restore item" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setRestoring(null)
    }
  }

  const handlePermanentDelete = async () => {
    if (!deleteDialog) return
    const { model, item } = deleteDialog
    try {
      setDeleting(true)
      const response = await fetch(`/api/trash/${model}/${item.id}`, { method: "DELETE" })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Failed to delete item")
      }
      setDeleteDialog(null)
      setMessage({ type: "success", text: `"${item.name}" has been permanently deleted.` })
      setTimeout(() => setMessage(null), 5000)
      fetchTrash()
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to delete item" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setDeleting(false)
    }
  }

  const handleRestoreRows = async (batch: DeletedRowBatch) => {
    const key = `row-${batch.databaseId}-${batch.batchIndex}`
    try {
      setRestoringRow(key)
      setMessage(null)
      const response = await fetch(`/api/databases/${batch.databaseId}/rows/deleted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchIndex: batch.batchIndex }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Failed to restore rows")
      }
      const result = await response.json()
      setMessage({ type: "success", text: `${result.restored} row${result.restored !== 1 ? "s" : ""} restored to "${batch.databaseName}".` })
      setTimeout(() => setMessage(null), 5000)
      fetchTrash()
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to restore rows" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setRestoringRow(null)
    }
  }

  const handlePermanentDeleteRows = async () => {
    if (!rowDeleteDialog) return
    const { batch } = rowDeleteDialog
    try {
      setDeleting(true)
      const response = await fetch(`/api/databases/${batch.databaseId}/rows/deleted`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchIndex: batch.batchIndex }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Failed to delete rows")
      }
      setRowDeleteDialog(null)
      setMessage({ type: "success", text: `${batch.rowCount} row${batch.rowCount !== 1 ? "s" : ""} permanently deleted from "${batch.databaseName}".` })
      setTimeout(() => setMessage(null), 5000)
      fetchTrash()
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to delete rows" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setDeleting(false)
    }
  }

  const deletedRows = data?.deletedRows || []
  const totalItems = data
    ? (Object.entries(data) as [string, any[]][])
        .filter(([key]) => key !== "deletedRows")
        .reduce((sum, [, items]) => sum + items.length, 0) + deletedRows.length
    : 0

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>

        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Trash</h1>
          <p className="text-sm text-gray-500 mt-1">
            View and recover deleted items. Items remain here until permanently deleted by an admin.
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
          </div>
        ) : totalItems === 0 ? (
          <div className="text-center py-16">
            <Trash2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-sm text-gray-500">Trash is empty</p>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl">
            {(Object.entries(TRASH_MODELS) as [TrashModelKey, { label: string }][]).map(
              ([key, config]) => {
                const items = data?.[key] || []
                if (items.length === 0) return null

                return (
                  <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <h2 className="text-sm font-medium text-gray-900">{config.label}</h2>
                      <span className="text-xs text-gray-500">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Deleted{" "}
                              {new Date(item.deletedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                              {item.deletedBy?.name
                                ? ` by ${item.deletedBy.name}`
                                : item.deletedBy?.email
                                ? ` by ${item.deletedBy.email}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => handleRestore(key, item)}
                              disabled={restoring === item.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              {restoring === item.id ? "Restoring..." : "Restore"}
                            </button>
                            <button
                              onClick={() =>
                                setDeleteDialog({ open: true, model: key, item })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
            )}

            {/* Deleted database rows */}
            {deletedRows.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-900">Deleted Database Rows</h2>
                  <span className="text-xs text-gray-500">
                    {deletedRows.length} batch{deletedRows.length !== 1 ? "es" : ""}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {deletedRows.map((batch) => {
                    const batchKey = `row-${batch.databaseId}-${batch.batchIndex}`
                    return (
                      <div
                        key={batchKey}
                        className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {batch.rowCount} row{batch.rowCount !== 1 ? "s" : ""} from &ldquo;{batch.databaseName}&rdquo;
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Deleted{" "}
                            {new Date(batch.deletedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {batch.deletedByName ? ` by ${batch.deletedByName}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handleRestoreRows(batch)}
                            disabled={restoringRow === batchKey}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {restoringRow === batchKey ? "Restoring..." : "Restore"}
                          </button>
                          <button
                            onClick={() => setRowDeleteDialog({ open: true, batch })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {deleteDialog && (
        <ConfirmDialog
          open={deleteDialog.open}
          onOpenChange={(open) => {
            if (!open) setDeleteDialog(null)
          }}
          title="Permanently Delete"
          description={`Are you sure you want to permanently delete "${deleteDialog.item.name}"? This action cannot be undone.`}
          confirmLabel="Delete Permanently"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handlePermanentDelete}
          loading={deleting}
        />
      )}

      {rowDeleteDialog && (
        <ConfirmDialog
          open={rowDeleteDialog.open}
          onOpenChange={(open) => {
            if (!open) setRowDeleteDialog(null)
          }}
          title="Permanently Delete Rows"
          description={`Are you sure you want to permanently delete ${rowDeleteDialog.batch.rowCount} row${rowDeleteDialog.batch.rowCount !== 1 ? "s" : ""} from "${rowDeleteDialog.batch.databaseName}"? This action cannot be undone.`}
          confirmLabel="Delete Permanently"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handlePermanentDeleteRows}
          loading={deleting}
        />
      )}
    </div>
  )
}

export default function TrashPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white">
          <div className="px-8 py-6">
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
            </div>
          </div>
        </div>
      }
    >
      <TrashContent />
    </Suspense>
  )
}
