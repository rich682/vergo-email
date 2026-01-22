"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Database, FileSpreadsheet, Upload, Loader2, Settings } from "lucide-react"
import { DataTab } from "@/components/jobs/table"
import { EnableDataModal } from "./enable-data-modal"
import { CreateDatasetModal } from "@/components/datasets"

interface SchemaColumn {
  key: string
  label: string
  type: string
  required: boolean
}

interface DatasetTemplate {
  id: string
  name: string
  schema: SchemaColumn[]
  identityKey: string
  snapshotCount: number
  latestSnapshot?: {
    id: string
    rowCount: number
    createdAt: string
  } | null
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
 * 3. Enabled with schema: Show full data management UI
 */
export function DataTabUniversal({
  taskInstanceId,
  taskName,
  lineageId,
  isSnapshot,
  isAdHoc,
  onConvertToRecurring,
}: DataTabUniversalProps) {
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal state
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false)
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false)

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
    fetchDataStatus()
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
            Data is enabled. Upload a file to define columns or configure the schema manually.
          </p>
          <Button onClick={() => setIsSchemaModalOpen(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Configure Schema
          </Button>
        </div>

        {currentLineageId && (
          <CreateDatasetModal
            open={isSchemaModalOpen}
            onOpenChange={setIsSchemaModalOpen}
            taskId={taskInstanceId}
            taskName={taskName}
            onCreated={handleSchemaComplete}
          />
        )}
      </>
    )
  }

  // State 3: Data enabled WITH schema - show full data management UI
  // For now, reuse the existing DataTab component if lineage exists
  if (currentLineageId) {
    return (
      <DataTab
        taskInstanceId={taskInstanceId}
        lineageId={currentLineageId}
        isSnapshot={isSnapshot}
        isAdHoc={isAdHoc}
        onConvertToRecurring={onConvertToRecurring}
      />
    )
  }

  // Fallback: Data enabled but somehow no lineage (shouldn't happen)
  return (
    <div className="text-center py-16 bg-yellow-50 rounded-lg border border-yellow-200">
      <p className="text-yellow-700">
        Data is enabled but configuration is incomplete. Please refresh the page.
      </p>
      <Button 
        variant="outline" 
        onClick={fetchDataStatus}
        className="mt-4"
      >
        Refresh
      </Button>
    </div>
  )
}
