"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { 
  Database, FileSpreadsheet, Upload, Loader2, Settings, 
  Download, Trash2, Table2, Calendar, Key, AlertCircle,
  CheckCircle2
} from "lucide-react"
import { EnableDataModal } from "./enable-data-modal"
import { CreateDatasetModal, UploadDataModal } from "@/components/datasets"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { format } from "date-fns"

interface SchemaColumn {
  key: string
  label: string
  type: string
  required: boolean
}

interface SnapshotInfo {
  id: string
  rowCount: number
  createdAt: string
  periodLabel?: string
}

interface DatasetTemplate {
  id: string
  name: string
  schema: SchemaColumn[]
  identityKey: string
  snapshotCount: number
  latestSnapshot?: SnapshotInfo | null
}

interface DataStatus {
  enabled: boolean
  schemaConfigured: boolean
  datasetTemplate: DatasetTemplate | null
}

interface DataTabUniversalProps {
  taskInstanceId: string
  taskName: string
  lineageId: string | null
  isSnapshot?: boolean
  isAdHoc?: boolean
  onConvertToRecurring?: () => void
}

/**
 * Universal Data Tab Component
 * 
 * Shows different states based on Data enablement:
 * 1. Not enabled: Show "Enable Data" CTA
 * 2. Enabled but no schema: Show "Configure Schema" CTA
 * 3. Enabled with schema: Show data management UI with upload/download/delete
 */
export function DataTabUniversal({
  taskInstanceId,
  taskName,
  lineageId,
}: DataTabUniversalProps) {
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal state
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false)
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Current lineage ID (may be updated after enable)
  const [currentLineageId, setCurrentLineageId] = useState<string | null>(lineageId)

  const fetchDataStatus = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/data`,
        { credentials: "include" }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to load data status")
      }

      const data: DataStatus = await response.json()
      setDataStatus(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load data status"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [taskInstanceId])

  useEffect(() => {
    fetchDataStatus()
  }, [fetchDataStatus])

  // Update lineageId when it changes
  useEffect(() => {
    setCurrentLineageId(lineageId)
  }, [lineageId])

  const handleEnableComplete = (result: { lineage: { id: string } }) => {
    setCurrentLineageId(result.lineage.id)
    fetchDataStatus()
    // Open schema editor immediately after enabling
    setIsSchemaModalOpen(true)
  }

  const handleSchemaComplete = () => {
    setIsSchemaModalOpen(false)
    fetchDataStatus()
  }

  const handleUploadComplete = () => {
    setIsUploadModalOpen(false)
    fetchDataStatus()
  }

  const handleDownloadTemplate = () => {
    if (!dataStatus?.datasetTemplate) return
    
    const { schema, identityKey } = dataStatus.datasetTemplate
    
    // Create CSV with header row
    const headers = schema.map(col => col.label)
    const csvContent = headers.join(",") + "\n"
    
    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${taskName.replace(/[^a-zA-Z0-9]/g, "_")}_template.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDeleteSchema = async () => {
    if (!dataStatus?.datasetTemplate) return
    
    setDeleting(true)
    try {
      const response = await fetch(
        `/api/datasets/${dataStatus.datasetTemplate.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete schema")
      }

      setIsDeleteConfirmOpen(false)
      fetchDataStatus()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete"
      setError(message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16 bg-red-50 rounded-lg border border-red-200">
        <p className="text-red-700">{error}</p>
        <Button 
          variant="outline" 
          onClick={fetchDataStatus}
          className="mt-4"
        >
          Try Again
        </Button>
      </div>
    )
  }

  // State 1: Data NOT enabled
  if (!dataStatus?.enabled) {
    return (
      <>
        <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No data enabled for this task
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Enable data to define a schema, upload spreadsheets, and manage period-based data for this task.
          </p>
          <Button onClick={() => setIsEnableModalOpen(true)}>
            <Database className="w-4 h-4 mr-2" />
            Enable Data
          </Button>
        </div>

        <EnableDataModal
          open={isEnableModalOpen}
          onOpenChange={setIsEnableModalOpen}
          taskInstanceId={taskInstanceId}
          taskName={taskName}
          onEnabled={handleEnableComplete}
        />
      </>
    )
  }

  // State 2: Data enabled but NO schema configured
  if (!dataStatus.schemaConfigured) {
    return (
      <>
        <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Configure your data schema
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Data is enabled. Upload a file to define columns and data types.
          </p>
          <Button onClick={() => setIsSchemaModalOpen(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Configure Schema
          </Button>
        </div>

        <CreateDatasetModal
          open={isSchemaModalOpen}
          onOpenChange={setIsSchemaModalOpen}
          taskId={taskInstanceId}
          taskName={taskName}
          onCreated={handleSchemaComplete}
        />
      </>
    )
  }

  // State 3: Data enabled WITH schema - show data management UI
  const template = dataStatus.datasetTemplate!
  const hasSnapshots = template.snapshotCount > 0
  const canDelete = !hasSnapshots

  return (
    <>
      <div className="space-y-6">
        {/* Action Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Table2 className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-600">
              {template.schema.length} columns configured
            </span>
            {hasSnapshots && (
              <>
                <span className="text-gray-300">•</span>
                <span className="text-sm text-gray-600">
                  {template.snapshotCount} snapshot{template.snapshotCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Schema
              </Button>
            )}
            
            <Button
              size="sm"
              onClick={() => setIsUploadModalOpen(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Data
            </Button>
          </div>
        </div>

        {/* Schema Summary */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-500" />
            Schema Configuration
          </h4>
          <div className="flex flex-wrap gap-2">
            {template.schema.map((col) => (
              <span
                key={col.key}
                className={`px-2 py-1 text-xs rounded ${
                  col.key === template.identityKey
                    ? "bg-amber-100 text-amber-800 font-medium"
                    : "bg-white text-gray-700 border border-gray-200"
                }`}
              >
                {col.label}
                {col.key === template.identityKey && " (ID)"}
              </span>
            ))}
          </div>
        </div>

        {/* Latest Snapshot Info or Empty State */}
        {hasSnapshots && template.latestSnapshot ? (
          <div className="bg-green-50 rounded-lg border border-green-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">
                    Latest Data: {template.latestSnapshot.rowCount.toLocaleString()} rows
                  </p>
                  <p className="text-xs text-green-700">
                    Uploaded {format(new Date(template.latestSnapshot.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    {template.latestSnapshot.periodLabel && ` • ${template.latestSnapshot.periodLabel}`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h4 className="text-sm font-medium text-gray-900 mb-1">
              No data uploaded yet
            </h4>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV file to add data for this task period.
            </p>
            <Button onClick={() => setIsUploadModalOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Data
            </Button>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadDataModal
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        datasetId={template.id}
        schema={template.schema}
        identityKey={template.identityKey}
        onUploaded={handleUploadComplete}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Delete Schema
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this schema? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSchema}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Schema"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
