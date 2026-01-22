"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { 
  Database, FileSpreadsheet, Upload, Loader2, Settings, 
  Download, Trash2, Table2, AlertCircle,
  CheckCircle2, Users, Eye, EyeOff
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

interface StakeholderMapping {
  columnKey: string
  matchedField: string
  visibility?: "own_rows" | "all_rows"
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
  stakeholderMapping: StakeholderMapping | null
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
  const [isDeleteDataConfirmOpen, setIsDeleteDataConfirmOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletingData, setDeletingData] = useState(false)
  const [updatingVisibility, setUpdatingVisibility] = useState(false)

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

  const handleVisibilityChange = async (visibility: "own_rows" | "all_rows") => {
    setUpdatingVisibility(true)
    try {
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/data`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ stakeholderVisibility: visibility }),
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update visibility")
      }

      fetchDataStatus()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update"
      setError(message)
    } finally {
      setUpdatingVisibility(false)
    }
  }

  const handleDeleteData = async () => {
    if (!dataStatus?.datasetTemplate?.latestSnapshot) return
    
    setDeletingData(true)
    try {
      const response = await fetch(
        `/api/datasets/${dataStatus.datasetTemplate.id}/snapshots/${dataStatus.datasetTemplate.latestSnapshot.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete data")
      }

      setIsDeleteDataConfirmOpen(false)
      fetchDataStatus()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete data"
      setError(message)
    } finally {
      setDeletingData(false)
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
  const canDeleteSchema = !hasSnapshots
  const hasStakeholderSettings = !!template.stakeholderMapping?.columnKey

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
          </div>
          
          <div className="flex items-center gap-2">
            {hasStakeholderSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSettingsOpen(true)}
                title="Data Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            
            {canDeleteSchema && (
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
            
            {!hasSnapshots && (
              <Button
                size="sm"
                onClick={() => setIsUploadModalOpen(true)}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Data
              </Button>
            )}
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
                    Data uploaded: {template.latestSnapshot.rowCount.toLocaleString()} rows
                  </p>
                  <p className="text-xs text-green-700">
                    Uploaded {format(new Date(template.latestSnapshot.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    {template.latestSnapshot.periodLabel && ` • ${template.latestSnapshot.periodLabel}`}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteDataConfirmOpen(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Data
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h4 className="text-sm font-medium text-gray-900 mb-1">
              No data uploaded yet
            </h4>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV or Excel file to add data for this task.
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

      {/* Settings Modal */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-500" />
              Data Settings
            </DialogTitle>
          </DialogHeader>
          {template.stakeholderMapping?.columnKey && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Stakeholder Visibility</p>
                    <p className="text-xs text-gray-500">
                      Column: {template.schema.find(c => c.key === template.stakeholderMapping?.columnKey)?.label || template.stakeholderMapping.columnKey}
                    </p>
                  </div>
                </div>
                <Select
                  value={template.stakeholderMapping.visibility || "all_rows"}
                  onValueChange={(value) => handleVisibilityChange(value as "own_rows" | "all_rows")}
                  disabled={updatingVisibility}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_rows">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        <span>See all rows</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="own_rows">
                      <div className="flex items-center gap-2">
                        <EyeOff className="w-4 h-4" />
                        <span>Own rows only</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {template.stakeholderMapping.visibility === "own_rows" 
                    ? "Stakeholders will only see rows where their email matches the stakeholder column."
                    : "All stakeholders can see all rows in the dataset."
                  }
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Schema Confirmation Modal */}
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

      {/* Delete Data Confirmation Modal */}
      <Dialog open={isDeleteDataConfirmOpen} onOpenChange={setIsDeleteDataConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Delete Data
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the uploaded data ({template.latestSnapshot?.rowCount.toLocaleString()} rows)? 
              This action cannot be undone. You will need to upload data again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDataConfirmOpen(false)}
              disabled={deletingData}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteData}
              disabled={deletingData}
            >
              {deletingData ? "Deleting..." : "Delete Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
