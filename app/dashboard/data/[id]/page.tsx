"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { 
  ArrowLeft, RefreshCw, Download, Upload, FileSpreadsheet,
  Calendar, Database, AlertCircle, CheckCircle2, Plus, Minus
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import Link from "next/link"

/**
 * Parse a date-only field for display without timezone shift.
 */
function parseDateOnly(dateStr: string): Date {
  const datePart = dateStr.split("T")[0]
  const [year, month, day] = datePart.split("-").map(Number)
  return new Date(year, month - 1, day)
}
import { UploadDataModal } from "@/components/datasets/upload-data-modal"
import { SnapshotDetailModal } from "@/components/datasets/snapshot-detail-modal"

interface SchemaColumn {
  key: string
  label: string
  type: string
  required: boolean
}

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
  rowCount: number
  diffSummary: DiffSummary | null
  sourceFilename: string | null
  createdAt: string
}

interface DatasetTemplate {
  id: string
  name: string
  description: string | null
  schema: SchemaColumn[]
  identityKey: string
  stakeholderMapping: { columnKey: string; matchedField: string } | null
  createdAt: string
  _count: { snapshots: number }
}

export default function DatasetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const datasetId = params.id as string

  const [template, setTemplate] = useState<DatasetTemplate | null>(null)
  const [snapshots, setSnapshots] = useState<DatasetSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)

  const fetchTemplate = useCallback(async () => {
    try {
      const response = await fetch(`/api/datasets/${datasetId}`, { credentials: "include" })
      if (!response.ok) {
        if (response.status === 404) {
          router.push("/dashboard/data")
          return
        }
        throw new Error("Failed to fetch dataset")
      }
      const data = await response.json()
      setTemplate(data.template)
    } catch (err: any) {
      setError(err.message)
    }
  }, [datasetId, router])

  const fetchSnapshots = useCallback(async () => {
    try {
      const response = await fetch(`/api/datasets/${datasetId}/snapshots`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setSnapshots(data.snapshots || [])
      }
    } catch (err) {
      console.error("Failed to fetch snapshots:", err)
    }
  }, [datasetId])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    await Promise.all([fetchTemplate(), fetchSnapshots()])
    setLoading(false)
  }, [fetchTemplate, fetchSnapshots])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleDownloadTemplate = () => {
    window.location.href = `/api/datasets/${datasetId}/template.csv`
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error || "Dataset not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/data")}>
            Back to Data
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/data"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Data
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{template.name}</h1>
            {template.description && (
              <p className="text-sm text-gray-500 mt-1">{template.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            <Button onClick={() => setIsUploadModalOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Data
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Left Column - Schema & Info */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Schema Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-500" />
              Schema ({template.schema.length} columns)
            </h3>
            <div className="space-y-2">
              {template.schema.map((col) => (
                <div
                  key={col.key}
                  className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                    col.key === template.identityKey
                      ? "bg-blue-50 border border-blue-200"
                      : "bg-gray-50"
                  }`}
                >
                  <div>
                    <span className="font-medium text-gray-900">{col.label}</span>
                    {col.key === template.identityKey && (
                      <span className="ml-2 text-xs text-blue-600 font-medium">
                        Identity Key
                      </span>
                    )}
                    <p className="text-xs text-gray-500">{col.key}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500 capitalize">{col.type}</span>
                    {col.required && (
                      <span className="ml-1 text-xs text-orange-500">*</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stakeholder Mapping */}
          {template.stakeholderMapping && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-medium text-gray-900 mb-2">Stakeholder Mapping</h3>
              <p className="text-sm text-gray-500">
                Column <span className="font-mono bg-gray-100 px-1">{template.stakeholderMapping.columnKey}</span> is
                mapped to user {template.stakeholderMapping.matchedField}
              </p>
            </div>
          )}
        </div>

        {/* Right Column - Snapshots */}
        <div className="col-span-12 lg:col-span-8">
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-gray-500" />
                Snapshot History
              </h3>
              <Button variant="ghost" size="sm" onClick={fetchSnapshots}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {snapshots.length === 0 ? (
              <div className="text-center py-12">
                <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-2">No snapshots uploaded yet</p>
                <p className="text-sm text-gray-400 mb-4">
                  Upload your first data snapshot to get started
                </p>
                <Button variant="outline" onClick={() => setIsUploadModalOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Data
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {snapshots.map((snapshot) => (
                  <button
                    key={snapshot.id}
                    onClick={() => setSelectedSnapshotId(snapshot.id)}
                    className="w-full px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {snapshot.periodLabel || "Untitled Period"}
                          </span>
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
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          {snapshot.periodStart && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {format(parseDateOnly(snapshot.periodStart), "MMM d, yyyy")}
                              {snapshot.periodEnd && (
                                <> - {format(parseDateOnly(snapshot.periodEnd), "MMM d, yyyy")}</>
                              )}
                            </span>
                          )}
                          <span>{snapshot.rowCount.toLocaleString()} rows</span>
                        </div>
                      </div>

                      {/* Diff Summary */}
                      {snapshot.diffSummary && (
                        <div className="flex items-center gap-3 text-sm">
                          {snapshot.diffSummary.addedCount > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                              <Plus className="w-3.5 h-3.5" />
                              {snapshot.diffSummary.addedCount}
                            </span>
                          )}
                          {snapshot.diffSummary.removedCount > 0 && (
                            <span className="flex items-center gap-1 text-red-600">
                              <Minus className="w-3.5 h-3.5" />
                              {snapshot.diffSummary.removedCount}
                            </span>
                          )}
                          {snapshot.diffSummary.addedCount === 0 && snapshot.diffSummary.removedCount === 0 && (
                            <span className="flex items-center gap-1 text-gray-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              No changes
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                      <span>
                        Uploaded {formatDistanceToNow(new Date(snapshot.createdAt), { addSuffix: true })}
                      </span>
                      {snapshot.sourceFilename && (
                        <span>from {snapshot.sourceFilename}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <UploadDataModal
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        datasetId={datasetId}
        schema={template.schema}
        identityKey={template.identityKey}
        onUploaded={() => {
          setIsUploadModalOpen(false)
          fetchSnapshots()
        }}
      />

      {/* Snapshot Detail Modal */}
      {selectedSnapshotId && (
        <SnapshotDetailModal
          open={!!selectedSnapshotId}
          onOpenChange={(open) => !open && setSelectedSnapshotId(null)}
          datasetId={datasetId}
          snapshotId={selectedSnapshotId}
        />
      )}
    </div>
  )
}
