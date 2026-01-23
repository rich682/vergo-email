"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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

// DataGrid imports
import {
  DataGrid,
  DataGridToolbar,
  schemaToColumns,
  createV1CellResolver,
  createEmptyFilterState,
  FormulaEditorModal,
} from "@/components/data-grid"
import type { AppColumnType, AppRowType, StatusOption, TeamMember, AppRowDefinition, AppRowValue, ColumnResource } from "@/components/data-grid"
import { evaluateExpression, buildFormulaContext } from "@/lib/formula"
import type { FormulaResultType } from "@/lib/formula"
import type {
  SheetContext,
  SheetMetadata,
  GridFilterState,
  ColumnDefinition,
  CellValue,
  CellResolver,
} from "@/lib/data-grid/types"

interface SchemaColumn {
  key: string
  label: string
  type: "text" | "number" | "date" | "boolean" | "currency"
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
  periodLabel?: string | null
}

interface SnapshotMetadataAPI {
  id: string
  periodLabel: string | null
  rowCount: number
  createdAt: string
  isLatest: boolean
}

interface DatasetTemplate {
  id: string
  name: string
  schema: SchemaColumn[]
  identityKey: string
  stakeholderMapping: StakeholderMapping | null
  snapshotCount: number
  latestSnapshot?: SnapshotInfo | null
  snapshots?: SnapshotMetadataAPI[]
}

interface DataStatus {
  enabled: boolean
  schemaConfigured: boolean
  datasetTemplate: DatasetTemplate | null
}

// App column types
interface AppColumnDef {
  id: string
  key: string
  label: string
  dataType: "text" | "status" | "attachment" | "user"
  config?: {
    options?: StatusOption[]
  } | null
  position: number
}

interface AppColumnValueData {
  [rowIdentity: string]: {
    value: unknown
    updatedAt: string
  }
}

// App row types (mirrors Prisma model)
interface AppRowDef {
  id: string
  rowType: "text" | "formula"
  label: string
  position: number
  formula?: Record<string, unknown> | null
  values: AppRowValueDef[]
}

interface AppRowValueDef {
  id: string
  rowId: string
  columnKey: string
  value: string | null
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
  const [isFormulaEditorOpen, setIsFormulaEditorOpen] = useState(false)
  const [formulaEditorMode, setFormulaEditorMode] = useState<"column" | "row">("column")
  const [deleting, setDeleting] = useState(false)
  const [deletingData, setDeletingData] = useState(false)
  const [updatingVisibility, setUpdatingVisibility] = useState(false)

  // Current lineage ID (may be updated after enable)
  const [currentLineageId, setCurrentLineageId] = useState<string | null>(lineageId)

  // DataGrid state
  const [currentSheet, setCurrentSheet] = useState<SheetContext | null>(null)
  const [snapshotRows, setSnapshotRows] = useState<Record<string, unknown>[]>([])
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [filterState, setFilterState] = useState<GridFilterState>(createEmptyFilterState())
  const [columns, setColumns] = useState<ColumnDefinition[]>([])
  
  // App columns state
  const [appColumns, setAppColumns] = useState<AppColumnDef[]>([])
  const [appColumnValues, setAppColumnValues] = useState<Map<string, AppColumnValueData>>(new Map())
  const [loadingAppColumns, setLoadingAppColumns] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // App rows state
  const [appRows, setAppRows] = useState<AppRowDef[]>([])
  const [loadingAppRows, setLoadingAppRows] = useState(false)

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

  // Fetch app columns when lineageId is available
  const fetchAppColumns = useCallback(async () => {
    if (!currentLineageId) return

    setLoadingAppColumns(true)
    try {
      const response = await fetch(
        `/api/task-lineages/${currentLineageId}/app-columns`,
        { credentials: "include" }
      )

      if (!response.ok) {
        console.error("Failed to fetch app columns")
        return
      }

      const data = await response.json()
      setAppColumns(data.columns || [])
    } catch (err) {
      console.error("Error fetching app columns:", err)
    } finally {
      setLoadingAppColumns(false)
    }
  }, [currentLineageId])

  // Fetch app column values for all columns
  const fetchAppColumnValues = useCallback(async (rowIdentities: string[]) => {
    if (!currentLineageId || appColumns.length === 0 || rowIdentities.length === 0) return

    try {
      const identitiesParam = rowIdentities.join(",")
      const valueMap = new Map<string, AppColumnValueData>()

      // Fetch values for each column
      await Promise.all(
        appColumns.map(async (col) => {
          const response = await fetch(
            `/api/task-lineages/${currentLineageId}/app-columns/${col.id}/values?identities=${encodeURIComponent(identitiesParam)}`,
            { credentials: "include" }
          )

          if (response.ok) {
            const data = await response.json()
            valueMap.set(col.id, data.values || {})
          }
        })
      )

      setAppColumnValues(valueMap)
    } catch (err) {
      console.error("Error fetching app column values:", err)
    }
  }, [currentLineageId, appColumns])

  // Fetch team members for owner column
  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await fetch("/api/team", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTeamMembers(data.members || [])
      }
    } catch (err) {
      console.error("Error fetching team members:", err)
    }
  }, [])

  // Handle adding a new app column
  const handleAddColumn = useCallback(async (type: AppColumnType, label: string) => {
    if (!currentLineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${currentLineageId}/app-columns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label, dataType: type }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to add column")
    }

    // Refresh app columns
    fetchAppColumns()
  }, [currentLineageId, fetchAppColumns])

  // Handle opening formula editor for column formulas
  const handleOpenFormulaEditor = useCallback(() => {
    setFormulaEditorMode("column")
    setIsFormulaEditorOpen(true)
  }, [])

  // Handle opening formula editor for row formulas
  const handleOpenRowFormulaEditor = useCallback(() => {
    setFormulaEditorMode("row")
    setIsFormulaEditorOpen(true)
  }, [])

  // Handle saving a formula column
  const handleSaveFormulaColumn = useCallback(async (formula: { expression: string; resultType: string; label: string }) => {
    if (!currentLineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${currentLineageId}/app-columns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          label: formula.label,
          dataType: "formula",
          config: {
            expression: formula.expression,
            resultType: formula.resultType,
          },
        }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to add formula column")
    }

    // Refresh app columns
    fetchAppColumns()
  }, [currentLineageId, fetchAppColumns])

  // Handle saving a formula row
  const handleSaveFormulaRow = useCallback(async (formula: { expression: string; resultType: string; label: string }) => {
    if (!currentLineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${currentLineageId}/app-rows`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          label: formula.label,
          rowType: "formula",
          formula: {
            expression: formula.expression,
            resultType: formula.resultType,
          },
        }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to add formula row")
    }

    // Refresh app rows
    fetchAppRows()
  }, [currentLineageId, fetchAppRows])

  // Handle updating a cell value
  const handleCellValueUpdate = useCallback(async (
    columnId: string,
    rowIdentity: string,
    value: unknown
  ) => {
    if (!currentLineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${currentLineageId}/app-columns/${columnId}/values/${encodeURIComponent(rowIdentity)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to update value")
    }

    // Update local state
    setAppColumnValues(prev => {
      const newMap = new Map(prev)
      const columnValues = newMap.get(columnId) || {}
      newMap.set(columnId, {
        ...columnValues,
        [rowIdentity]: {
          value,
          updatedAt: new Date().toISOString(),
        },
      })
      return newMap
    })
  }, [currentLineageId])

  // Handle deleting an app column
  const handleDeleteAppColumn = useCallback(async (columnId: string) => {
    if (!currentLineageId) throw new Error("No lineage ID")
    
    // Extract actual column ID (remove "app_" prefix)
    const actualColumnId = columnId.replace("app_", "")

    const response = await fetch(
      `/api/task-lineages/${currentLineageId}/app-columns/${actualColumnId}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to delete column")
    }

    // Refresh app columns
    fetchAppColumns()
  }, [currentLineageId, fetchAppColumns])

  // Fetch app rows
  const fetchAppRows = useCallback(async () => {
    if (!currentLineageId) return

    setLoadingAppRows(true)
    try {
      const response = await fetch(
        `/api/task-lineages/${currentLineageId}/app-rows`,
        { credentials: "include" }
      )

      if (!response.ok) {
        console.error("Failed to fetch app rows")
        return
      }

      const data = await response.json()
      setAppRows(data.rows || [])
    } catch (err) {
      console.error("Error fetching app rows:", err)
    } finally {
      setLoadingAppRows(false)
    }
  }, [currentLineageId])

  // Handle adding a new app row
  const handleAddRow = useCallback(async (type: AppRowType, label: string) => {
    if (!currentLineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${currentLineageId}/app-rows`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label, rowType: type }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to add row")
    }

    // Refresh app rows
    fetchAppRows()
  }, [currentLineageId, fetchAppRows])

  // Handle updating an app row cell value
  const handleRowCellValueUpdate = useCallback(async (
    rowId: string,
    columnKey: string,
    value: string | null
  ) => {
    if (!currentLineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${currentLineageId}/app-rows/${rowId}/values`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ values: [{ columnKey, value }] }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to update row value")
    }

    // Refresh app rows to get updated values
    fetchAppRows()
  }, [currentLineageId, fetchAppRows])

  // Update lineageId when it changes
  useEffect(() => {
    setCurrentLineageId(lineageId)
  }, [lineageId])

  // Fetch app columns and rows when lineageId becomes available
  useEffect(() => {
    if (currentLineageId) {
      fetchAppColumns()
      fetchAppRows()
      fetchTeamMembers()
    }
  }, [currentLineageId, fetchAppColumns, fetchAppRows, fetchTeamMembers])

  // Initialize columns from schema and app columns
  useEffect(() => {
    if (dataStatus?.datasetTemplate?.schema) {
      const sourceCols = schemaToColumns(dataStatus.datasetTemplate.schema)
      
      // Convert app columns to ColumnDefinition format
      const appCols: ColumnDefinition[] = appColumns.map(col => ({
        id: `app_${col.id}`,
        key: col.key,
        label: col.label,
        kind: "app" as const,
        dataType: col.dataType as ColumnDefinition["dataType"],
        isFilterable: col.dataType === "text" || col.dataType === "status",
        isSortable: col.dataType === "text" || col.dataType === "status",
        isVisible: true,
      }))
      
      setColumns([...sourceCols, ...appCols])
    }
  }, [dataStatus?.datasetTemplate?.schema, appColumns])

  // Initialize current sheet when snapshots are available
  useEffect(() => {
    if (dataStatus?.datasetTemplate?.latestSnapshot && !currentSheet) {
      setCurrentSheet({
        kind: "snapshot",
        snapshotId: dataStatus.datasetTemplate.latestSnapshot.id,
      })
    }
  }, [dataStatus?.datasetTemplate?.latestSnapshot, currentSheet])

  // Fetch snapshot rows when sheet changes
  const fetchSnapshotRows = useCallback(async (snapshotId: string) => {
    if (!dataStatus?.datasetTemplate?.id) return

    setLoadingSnapshot(true)
    setSnapshotError(null)

    try {
      const response = await fetch(
        `/api/datasets/${dataStatus.datasetTemplate.id}/snapshots/${snapshotId}`,
        { credentials: "include" }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to load snapshot data")
      }

      const data = await response.json()
      const rows = data.snapshot?.rows || []
      setSnapshotRows(Array.isArray(rows) ? rows : [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load snapshot data"
      setSnapshotError(message)
      setSnapshotRows([])
    } finally {
      setLoadingSnapshot(false)
    }
  }, [dataStatus?.datasetTemplate?.id])

  // Fetch rows when sheet changes
  useEffect(() => {
    if (currentSheet?.kind === "snapshot" && currentSheet.snapshotId) {
      fetchSnapshotRows(currentSheet.snapshotId)
    }
  }, [currentSheet, fetchSnapshotRows])

  // Fetch app column values when snapshot rows are loaded
  useEffect(() => {
    if (snapshotRows.length > 0 && appColumns.length > 0 && dataStatus?.datasetTemplate?.identityKey) {
      const identityKey = dataStatus.datasetTemplate.identityKey
      const identities = snapshotRows
        .map(row => String(row[identityKey] || ""))
        .filter(Boolean)
      
      if (identities.length > 0) {
        fetchAppColumnValues(identities)
      }
    }
  }, [snapshotRows, appColumns, dataStatus?.datasetTemplate?.identityKey, fetchAppColumnValues])

  // Create cell resolver that handles both source and app columns
  const cellResolver = useMemo<CellResolver | null>(() => {
    if (!dataStatus?.datasetTemplate?.identityKey) return null
    
    const identityKey = dataStatus.datasetTemplate.identityKey
    const baseResolver = createV1CellResolver(identityKey)
    
    // Return an extended resolver that handles app columns
    return {
      getRowId: baseResolver.getRowId,
      getCellValue: (args) => {
        const { row, column, sheet } = args
        
        // For source columns, use the base resolver
        if (column.kind === "source") {
          return baseResolver.getCellValue(args)
        }
        
        // For app columns, look up value from appColumnValues or evaluate formula
        if (column.kind === "app") {
          const columnId = column.id.replace("app_", "")
          const rowIdentity = String(row[identityKey] || "")
          
          // Find the app column definition
          const appCol = appColumns.find(c => c.id === columnId)
          
          // Handle formula columns - evaluate the expression
          if (appCol?.dataType === "formula" && appCol.config?.expression) {
            try {
              const schemaColumns = dataStatus?.datasetTemplate?.schema || []
              const context = buildFormulaContext(
                "current",
                [{ id: "current", label: "Current", rows: snapshotRows }],
                schemaColumns.map(col => ({ key: col.key, label: col.label, dataType: col.type }))
              )
              const rowContext = {
                rowIndex: 0,
                row,
                identity: rowIdentity,
              }
              const result = evaluateExpression(appCol.config.expression as string, context, rowContext)
              
              if (result.ok) {
                const resultType = (appCol.config.resultType as FormulaResultType) || "number"
                if (resultType === "currency") {
                  return { type: "currency", value: result.value }
                }
                return { type: "number", value: result.value }
              } else {
                return { type: "error", message: result.error }
              }
            } catch (err) {
              return { type: "error", message: err instanceof Error ? err.message : "Formula error" }
            }
          }
          
          const columnValues = appColumnValues.get(columnId)
          const cellData = columnValues?.[rowIdentity]
          
          if (!cellData || cellData.value === null || cellData.value === undefined) {
            return { type: "empty" }
          }
          
          // Convert stored value to CellValue based on column type
          if (appCol?.dataType === "text") {
            const textVal = cellData.value as { text?: string }
            return { type: "text", value: textVal.text || "" }
          }
          if (appCol?.dataType === "status") {
            const statusVal = cellData.value as { statusKey?: string }
            const option = appCol.config?.options?.find(o => o.key === statusVal.statusKey)
            return { type: "label", value: option ? [option.label] : [] }
          }
          if (appCol?.dataType === "user") {
            const userVal = cellData.value as { userId?: string }
            const user = teamMembers.find(m => m.id === userVal.userId)
            if (user) {
              return { type: "user", value: { userId: user.id, display: user.name || user.email } }
            }
          }
          if (appCol?.dataType === "attachment") {
            const attachVal = cellData.value as { files?: unknown[] }
            return { type: "attachment", value: (attachVal.files || []) as any }
          }
          
          return { type: "empty" }
        }
        
        return { type: "empty" }
      },
    }
  }, [dataStatus?.datasetTemplate?.identityKey, dataStatus?.datasetTemplate?.schema, appColumnValues, appColumns, teamMembers, snapshotRows])

  // Convert API snapshots to SheetMetadata
  const sheets: SheetMetadata[] = useMemo(() => {
    if (!dataStatus?.datasetTemplate?.snapshots) return []
    return dataStatus.datasetTemplate.snapshots.map(s => ({
      id: s.id,
      periodLabel: s.periodLabel,
      createdAt: s.createdAt,
      rowCount: s.rowCount,
      isLatest: s.isLatest,
    }))
  }, [dataStatus?.datasetTemplate?.snapshots])

  // Convert schema columns to ColumnResource for formula editor
  const formulaColumnResources: ColumnResource[] = useMemo(() => {
    if (!dataStatus?.datasetTemplate?.schema) return []
    return dataStatus.datasetTemplate.schema.map(col => ({
      key: col.key,
      label: col.label,
      dataType: col.type,
    }))
  }, [dataStatus?.datasetTemplate?.schema])

  // Get sample row for formula preview
  const sampleRow = useMemo(() => {
    return snapshotRows.length > 0 ? snapshotRows[0] : undefined
  }, [snapshotRows])

  // Handle sheet change
  const handleSheetChange = useCallback((sheet: SheetContext) => {
    setCurrentSheet(sheet)
    // Reset filter state on sheet change
    setFilterState(createEmptyFilterState())
  }, [])

  // Handle column visibility change
  const handleColumnVisibilityChange = useCallback((columnId: string, isVisible: boolean) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, isVisible } : col
    ))
  }, [])

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
      <div className="flex flex-col h-full space-y-4">
        {/* Action Bar */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Table2 className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-600">
              {template.schema.length + appColumns.length} columns
              {appColumns.length > 0 && (
                <span className="text-gray-400 ml-1">
                  ({appColumns.length} custom)
                </span>
              )}
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
            
            {/* Only show Download Template when no data uploaded yet */}
            {!hasSnapshots && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
            )}
            
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

            {hasSnapshots && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteDataConfirmOpen(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Upload
              </Button>
            )}
          </div>
        </div>

        {/* Data Grid or Empty State */}
        {hasSnapshots && currentSheet && cellResolver ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Toolbar */}
            <DataGridToolbar
              filterState={filterState}
              onFilterChange={setFilterState}
              columns={columns}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              sheets={sheets}
              currentSheet={currentSheet}
              onSheetChange={handleSheetChange}
            />
            
            {/* Grid */}
            <div className="flex-1 min-h-0">
              <DataGrid
                columns={columns}
                rows={snapshotRows}
                resolver={cellResolver}
                sheet={currentSheet}
                initialFilterState={filterState}
                onFilterChange={setFilterState}
                onColumnVisibilityChange={handleColumnVisibilityChange}
                isLoading={loadingSnapshot}
                error={snapshotError}
                onAddColumn={handleAddColumn}
                onHideColumn={handleColumnVisibilityChange ? (id) => handleColumnVisibilityChange(id, false) : undefined}
                onDeleteColumn={handleDeleteAppColumn}
                onCellValueChange={handleCellValueUpdate}
                identityKey={dataStatus?.datasetTemplate?.identityKey}
                showAddColumn={!!currentLineageId}
                appRows={appRows}
                onAddRow={handleAddRow}
                onRowCellValueChange={handleRowCellValueUpdate}
                showAddRow={!!currentLineageId}
                sheets={sheets}
                onSheetChange={handleSheetChange}
                onAddSheet={() => setIsUploadModalOpen(true)}
                canAddSheet={dataStatus?.schemaConfigured && !hasSnapshots ? false : dataStatus?.schemaConfigured}
                onFormulaColumnSelect={handleOpenFormulaEditor}
                onFormulaRowSelect={handleOpenRowFormulaEditor}
              />
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

      {/* Delete Upload Confirmation Modal */}
      <Dialog open={isDeleteDataConfirmOpen} onOpenChange={setIsDeleteDataConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Delete Upload
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this upload ({template.latestSnapshot?.rowCount.toLocaleString()} rows)? 
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
              {deletingData ? "Deleting..." : "Delete Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Formula Editor Modal */}
      <FormulaEditorModal
        open={isFormulaEditorOpen}
        onOpenChange={setIsFormulaEditorOpen}
        mode={formulaEditorMode}
        columns={formulaColumnResources}
        sampleRow={sampleRow}
        allRows={snapshotRows}
        onSave={formulaEditorMode === "column" ? handleSaveFormulaColumn : handleSaveFormulaRow}
      />
    </>
  )
}
