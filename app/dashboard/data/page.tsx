"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw, Database, FileSpreadsheet } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { CreateDatasetModal } from "@/components/datasets/create-dataset-modal"

interface DatasetTemplate {
  id: string
  name: string
  description: string | null
  schema: Array<{ key: string; label: string; type: string; required: boolean }>
  identityKey: string
  createdAt: string
  _count: { snapshots: number }
  latestSnapshot?: { createdAt: string; rowCount: number } | null
}

export default function DataPage() {
  const [templates, setTemplates] = useState<DatasetTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/datasets", { credentials: "include" })
      if (!response.ok) {
        throw new Error("Failed to fetch datasets")
      }
      const data = await response.json()
      setTemplates(data.templates || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  if (loading && templates.length === 0) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Data</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage dataset templates and upload period-based snapshots
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchTemplates}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Dataset
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Dataset List */}
      {templates.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No datasets yet
          </h3>
          <p className="text-gray-500 mb-4 max-w-md mx-auto">
            Create a dataset template to define your data structure, then upload
            snapshots for each period.
          </p>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Dataset
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/dashboard/data/${template.id}`}
              className="block p-6 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{template.name}</h3>
                  {template.description && (
                    <p className="text-sm text-gray-500 line-clamp-1">
                      {template.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-gray-500">
                  <span>{template.schema.length} columns</span>
                  <span>Key: {template.identityKey}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">
                    {template._count.snapshots} snapshot{template._count.snapshots !== 1 ? "s" : ""}
                  </span>
                  {template.latestSnapshot ? (
                    <span className="text-gray-500">
                      {template.latestSnapshot.rowCount.toLocaleString()} rows
                    </span>
                  ) : (
                    <span className="text-gray-400 italic">No data uploaded</span>
                  )}
                </div>
                {template.latestSnapshot && (
                  <p className="text-xs text-gray-400">
                    Last updated {formatDistanceToNow(new Date(template.latestSnapshot.createdAt), { addSuffix: true })}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Dataset Modal */}
      <CreateDatasetModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreated={() => {
          setIsCreateModalOpen(false)
          fetchTemplates()
        }}
      />
    </div>
  )
}
