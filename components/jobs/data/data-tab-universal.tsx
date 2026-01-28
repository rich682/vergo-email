"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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

// DataGrid imports
import {
  DataGrid,
  DataGridToolbar,
  schemaToColumns,
  createV1CellResolver,
  createEmptyFilterState,
  FormulaEditorModal,
} from "@/components/data-grid"
import type { ColumnResource, RowResource } from "@/components/data-grid"
import { evaluateExpression, buildFormulaContext } from "@/lib/formula"
import type { FormulaResultType } from "@/lib/formula"

// Import types and hooks from new modular structure
import type {
  DataTabUniversalProps,
  SheetContext,
  GridFilterState,
  ColumnDefinition,
  CellResolver,
} from "./types"
import {
  useDataStatus,
  usePeriodContext,
  useAppColumns,
  useAppRows,
  useSheetData,
  useCellFormulas,
} from "./hooks"

/**
 * Universal Data Tab Component (Refactored)
 * 
 * Now uses modular hooks for better separation of concerns
 * and to avoid circular dependency issues.
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
  isSnapshot,
  isAdHoc,
  onConvertToRecurring,
  boardPeriodStart,
  boardPeriodEnd,
  boardName,
}: DataTabUniversalProps) {
  // Core data status hook
  const { dataStatus, loading, error, fetchDataStatus } = useDataStatus(taskInstanceId)
  
  // Period label ref - used by other hooks to avoid circular deps
  const periodLabelRef = useRef<string | null>(null)
  
  // Current lineage ID (may be updated after enable)
  const [currentLineageId, setCurrentLineageId] = useState<string | null>(lineageId)
  
  // Sheet/grid state
  const [currentSheet, setCurrentSheet] = useState<SheetContext | null>(null)
  const [filterState, setFilterState] = useState<GridFilterState>(createEmptyFilterState())
  const [columns, setColumns] = useState<ColumnDefinition[]>([])

  // Period context hook
  const periodContext = usePeriodContext({
    boardPeriodStart,
    boardPeriodEnd,
    boardName,
    snapshots: dataStatus?.datasetTemplate?.snapshots,
    currentSheet,
  })
  
  // Keep the ref in sync
  useEffect(() => {
    periodLabelRef.current = periodContext.currentPeriodLabel
  }, [periodContext.currentPeriodLabel])
  
  // App columns hook
  const appColumnsHook = useAppColumns({
    lineageId: currentLineageId,
    periodLabelRef,
  })
  
  // App rows hook
  const appRowsHook = useAppRows({
    lineageId: currentLineageId,
    periodLabelRef,
  })
  
  // Sheet data hook
  const sheetDataHook = useSheetData({
    datasetTemplateId: dataStatus?.datasetTemplate?.id,
    currentSheet,
  })
  
  // Cell formulas hook
  const cellFormulasHook = useCellFormulas({
    lineageId: currentLineageId,
  })
  
  // Team members state (shared for user columns)
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string | null; email: string }>>([])
  
  // Fetch team members
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

  useEffect(() => {
    fetchTeamMembers()
  }, [fetchTeamMembers])
  
  // Modal state
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false)
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeleteDataConfirmOpen, setIsDeleteDataConfirmOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isFormulaEditorOpen, setIsFormulaEditorOpen] = useState(false)
  const [formulaEditorMode, setFormulaEditorMode] = useState<"column" | "row">("column")
  
  // Editing state for formula columns/rows
  const [editingFormulaColumnId, setEditingFormulaColumnId] = useState<string | null>(null)
  const [editingFormulaRowId, setEditingFormulaRowId] = useState<string | null>(null)
  
  // Operation states
  const [deleting, setDeleting] = useState(false)
  const [deletingData, setDeletingData] = useState(false)
  const [updatingVisibility, setUpdatingVisibility] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // Update lineageId when it changes
  useEffect(() => {
    setCurrentLineageId(lineageId)
  }, [lineageId])

  // Initialize columns from schema and app columns
  useEffect(() => {
    if (dataStatus?.datasetTemplate?.schema) {
      const sourceCols = schemaToColumns(dataStatus.datasetTemplate.schema)
      
      // Convert app columns to ColumnDefinition format
      const appCols: ColumnDefinition[] = appColumnsHook.appColumns.map(col => ({
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
  }, [dataStatus?.datasetTemplate?.schema, appColumnsHook.appColumns])

  // Fetch app column values when snapshot rows are loaded
  useEffect(() => {
    if (sheetDataHook.snapshotRows.length > 0 && appColumnsHook.appColumns.length > 0 && dataStatus?.datasetTemplate?.identityKey) {
      const identityKey = dataStatus.datasetTemplate.identityKey
      const identities = sheetDataHook.snapshotRows
        .map(row => String(row[identityKey] || ""))
        .filter(Boolean)
      
      if (identities.length > 0) {
        appColumnsHook.fetchAppColumnValues(identities)
      }
    }
  }, [sheetDataHook.snapshotRows, appColumnsHook.appColumns, dataStatus?.datasetTemplate?.identityKey, appColumnsHook.fetchAppColumnValues])

  // Create cell resolver that handles both source and app columns
  const cellResolver = useMemo<CellResolver | null>(() => {
    if (!dataStatus?.datasetTemplate?.identityKey) return null
    
    const identityKey = dataStatus.datasetTemplate.identityKey
    const baseResolver = createV1CellResolver(identityKey)
    
    return {
      getRowId: baseResolver.getRowId,
      getCellValue: (args) => {
        const { row, column } = args
        
        // For source columns, use the base resolver
        if (column.kind === "source") {
          return baseResolver.getCellValue(args)
        }
        
        // For app columns, look up value from appColumnValues or evaluate formula
        if (column.kind === "app") {
          const columnId = column.id.replace("app_", "")
          const rowIdentity = String(row[identityKey] || "")
          
          // Find the app column definition
          const appCol = appColumnsHook.appColumns.find(c => c.id === columnId)
          
          // Handle formula columns - evaluate the expression
          if (appCol?.dataType === "formula" && appCol.config?.expression) {
            const schemaColumns = dataStatus?.datasetTemplate?.schema
            if (!schemaColumns || schemaColumns.length === 0) {
              return { type: "empty" }
            }
            
            try {
              const context = buildFormulaContext(
                "current",
                [{ id: "current", label: "Current", rows: sheetDataHook.snapshotRows }],
                schemaColumns.map(col => ({ key: col.key, label: col.label, dataType: col.type })),
                identityKey
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
              console.error("[DataTabUniversal] Formula evaluation error:", err)
              return { type: "error", message: err instanceof Error ? err.message : "Formula error" }
            }
          }
          
          const columnValues = appColumnsHook.appColumnValues.get(columnId)
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
  }, [dataStatus?.datasetTemplate?.identityKey, dataStatus?.datasetTemplate?.schema, appColumnsHook.appColumnValues, appColumnsHook.appColumns, teamMembers, sheetDataHook.snapshotRows])

  // Initialize current sheet - prefer sheet with data (better UX)
  useEffect(() => {
    const { sheets } = periodContext
    
    if (!currentSheet && sheets.length > 0) {
      // First, try to find a sheet with data
      const currentPeriodWithData = sheets.find(s => s.isCurrentPeriod && s.rowCount > 0)
      if (currentPeriodWithData) {
        setCurrentSheet({ kind: "snapshot", snapshotId: currentPeriodWithData.id })
        return
      }
      
      const anySheetWithData = sheets.find(s => s.rowCount > 0)
      if (anySheetWithData) {
        setCurrentSheet({ kind: "snapshot", snapshotId: anySheetWithData.id })
        return
      }
      
      // Fall back to latest snapshot
      if (dataStatus?.datasetTemplate?.latestSnapshot) {
        setCurrentSheet({ kind: "snapshot", snapshotId: dataStatus.datasetTemplate.latestSnapshot.id })
        return
      }
      
      // Fall back to current period or first sheet
      const currentPeriodSheet = sheets.find(s => s.isCurrentPeriod)
      if (currentPeriodSheet && currentPeriodSheet.id !== "current-period") {
        setCurrentSheet({ kind: "snapshot", snapshotId: currentPeriodSheet.id })
      } else if (sheets.length > 0 && sheets[0].id !== "current-period") {
        setCurrentSheet({ kind: "snapshot", snapshotId: sheets[0].id })
      }
    }
  }, [periodContext.sheets, dataStatus?.datasetTemplate?.latestSnapshot, currentSheet])

  // Build formula column resources for formula editor
  const formulaColumnResources: ColumnResource[] = useMemo(() => {
    if (!dataStatus?.datasetTemplate?.schema) return []
    return dataStatus.datasetTemplate.schema.map(col => ({
      key: col.key,
      label: col.label,
      dataType: col.type,
    }))
  }, [dataStatus?.datasetTemplate?.schema])

  // Build other sheets for cross-sheet formula references
  const otherSheets = useMemo(() => {
    if (!currentSheet) return []
    const currentSheetId = currentSheet.kind === "snapshot" ? currentSheet.snapshotId : null
    return periodContext.sheets
      .filter(s => s.id !== currentSheetId && s.id !== "current-period")
      .map(s => ({
        id: s.id,
        label: s.periodLabel || s.id,
        columns: formulaColumnResources,
      }))
  }, [periodContext.sheets, currentSheet, formulaColumnResources])

  // Sample row for formula preview
  const sampleRow = useMemo(() => {
    return sheetDataHook.snapshotRows.length > 0 ? sheetDataHook.snapshotRows[0] : undefined
  }, [sheetDataHook.snapshotRows])

  // Build formula columns map for DataGrid
  const formulaColumnsMap = useMemo(() => {
    const map = new Map<string, { expression: string; resultType: string; label: string }>()
    for (const col of appColumnsHook.appColumns) {
      if (col.dataType === "formula" && col.config?.expression) {
        map.set(`app_${col.id}`, {
          expression: col.config.expression as string,
          resultType: (col.config.resultType as string) || "number",
          label: col.label,
        })
      }
    }
    return map
  }, [appColumnsHook.appColumns])

  // Get editing formula data
  const editingFormulaColumnData = useMemo(() => {
    if (!editingFormulaColumnId) return null
    const col = appColumnsHook.appColumns.find(c => c.id === editingFormulaColumnId)
    if (!col || col.dataType !== "formula") return null
    return {
      expression: (col.config?.expression as string) || "",
      resultType: (col.config?.resultType as FormulaResultType) || "number",
      label: col.label,
    }
  }, [editingFormulaColumnId, appColumnsHook.appColumns])

  const editingFormulaRowData = useMemo(() => {
    if (!editingFormulaRowId) return null
    const row = appRowsHook.appRows.find(r => r.id === editingFormulaRowId)
    if (!row || row.rowType !== "formula" || !row.formula) return null
    return {
      expression: (row.formula.expression as string) || "",
      resultType: (row.formula.resultType as FormulaResultType) || "number",
      label: row.label,
    }
  }, [editingFormulaRowId, appRowsHook.appRows])

  // Handlers
  const handleSheetChange = useCallback((sheet: SheetContext) => {
    setCurrentSheet(sheet)
    setFilterState(createEmptyFilterState())
  }, [])

  const handleColumnVisibilityChange = useCallback((columnId: string, isVisible: boolean) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, isVisible } : col
    ))
  }, [])

  const handleOpenFormulaEditor = useCallback(() => {
    setFormulaEditorMode("column")
    setEditingFormulaColumnId(null)
    setIsFormulaEditorOpen(true)
  }, [])

  const handleOpenRowFormulaEditor = useCallback(() => {
    setFormulaEditorMode("row")
    setEditingFormulaRowId(null)
    setIsFormulaEditorOpen(true)
  }, [])

  const handleEditFormulaColumn = useCallback((columnId: string) => {
    setFormulaEditorMode("column")
    setEditingFormulaColumnId(columnId.replace("app_", ""))
    setIsFormulaEditorOpen(true)
  }, [])

  const handleEditFormulaRow = useCallback((rowId: string) => {
    setFormulaEditorMode("row")
    setEditingFormulaRowId(rowId)
    setIsFormulaEditorOpen(true)
  }, [])

  const handleSaveFormulaColumn = useCallback(async (formula: { expression: string; resultType: string; label: string }) => {
    if (!currentLineageId) throw new Error("No lineage ID")

    if (editingFormulaColumnId) {
      // Update existing
      const response = await fetch(
        `/api/task-lineages/${currentLineageId}/app-columns/${editingFormulaColumnId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            label: formula.label,
            config: { expression: formula.expression, resultType: formula.resultType },
          }),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update formula column")
      }
    } else {
      // Create new
      const response = await fetch(
        `/api/task-lineages/${currentLineageId}/app-columns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            label: formula.label,
            dataType: "formula",
            config: { expression: formula.expression, resultType: formula.resultType },
          }),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add formula column")
      }
    }

    setEditingFormulaColumnId(null)
    appColumnsHook.fetchAppColumns()
    if (!editingFormulaColumnId) {
      appRowsHook.fetchAppRows()
    }
  }, [currentLineageId, editingFormulaColumnId, appColumnsHook, appRowsHook])

  const handleSaveFormulaRow = useCallback(async (formula: { expression: string; resultType: string; label: string }) => {
    if (!currentLineageId) throw new Error("No lineage ID")

    if (editingFormulaRowId) {
      // Update existing
      const response = await fetch(
        `/api/task-lineages/${currentLineageId}/app-rows/${editingFormulaRowId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            label: formula.label,
            formula: { expression: formula.expression, resultType: formula.resultType },
          }),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update formula row")
      }
    } else {
      // Create new
      const response = await fetch(
        `/api/task-lineages/${currentLineageId}/app-rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            label: formula.label,
            rowType: "formula",
            formula: { expression: formula.expression, resultType: formula.resultType },
          }),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add formula row")
      }
    }

    setEditingFormulaRowId(null)
    appRowsHook.fetchAppRows()
    if (!editingFormulaRowId) {
      appColumnsHook.fetchAppColumns()
    }
  }, [currentLineageId, editingFormulaRowId, appRowsHook, appColumnsHook])

  const handleEnableComplete = (result: { lineage: { id: string } }) => {
    setCurrentLineageId(result.lineage.id)
    fetchDataStatus()
    setIsSchemaModalOpen(true)
  }

  const handleSchemaComplete = () => {
    setIsSchemaModalOpen(false)
    fetchDataStatus()
  }

  const handleUploadComplete = () => {
    setIsUploadModalOpen(false)
    setCurrentSheet(null)
    sheetDataHook.setSnapshotRows([])
    fetchDataStatus()
  }

  const handleDownloadTemplate = () => {
    if (!dataStatus?.datasetTemplate) return
    
    const { schema } = dataStatus.datasetTemplate
    const headers = schema.map(col => col.label)
    const csvContent = headers.join(",") + "\n"
    
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
        { method: "DELETE", credentials: "include" }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete schema")
      }
      setIsDeleteConfirmOpen(false)
      fetchDataStatus()
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Failed to delete")
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
      setLocalError(err instanceof Error ? err.message : "Failed to update")
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
        { method: "DELETE", credentials: "include" }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete data")
      }
      setIsDeleteDataConfirmOpen(false)
      setCurrentSheet(null)
      fetchDataStatus()
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Failed to delete data")
    } finally {
      setDeletingData(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // Error state
  if (error || localError) {
    return (
      <div className="text-center py-16 bg-red-50 rounded-lg border border-red-200">
        <p className="text-red-700">{error || localError}</p>
        <Button 
          variant="outline" 
          onClick={() => { setLocalError(null); fetchDataStatus(); }}
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
  const { currentPeriodLabel, currentPeriodSnapshot, sheets, isViewingCurrentPeriod } = periodContext

  return (
    <>
      <div className="flex flex-col h-full space-y-4">
        {/* Task Name Header */}
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{taskName}</h2>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Table2 className="w-5 h-5 text-gray-500" />
            <span className="text-sm text-gray-600">
              {template.schema.length + appColumnsHook.appColumns.length} columns
              {appColumnsHook.appColumns.length > 0 && (
                <span className="text-gray-400 ml-1">
                  ({appColumnsHook.appColumns.length} custom)
                </span>
              )}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {hasStakeholderSettings && (
              <Button variant="outline" size="sm" onClick={() => setIsSettingsOpen(true)} title="Data Settings">
                <Settings className="w-4 h-4" />
              </Button>
            )}
            
            {!hasSnapshots && (
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
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
            
            {(!hasSnapshots || isViewingCurrentPeriod) && (
              <Button size="sm" onClick={() => setIsUploadModalOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Data
              </Button>
            )}

            {hasSnapshots && isViewingCurrentPeriod && currentPeriodSnapshot && (
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
            <DataGridToolbar
              filterState={filterState}
              onFilterChange={setFilterState}
              columns={columns}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              sheets={sheets}
              currentSheet={currentSheet}
              onSheetChange={handleSheetChange}
            />
            
            <div className="flex-1 min-h-0">
              <DataGrid
                columns={columns}
                rows={sheetDataHook.snapshotRows}
                resolver={cellResolver}
                sheet={currentSheet}
                initialFilterState={filterState}
                onFilterChange={setFilterState}
                onColumnVisibilityChange={handleColumnVisibilityChange}
                isLoading={sheetDataHook.loadingSnapshot}
                error={sheetDataHook.snapshotError}
                onAddColumn={appColumnsHook.handleAddColumn}
                onHideColumn={(id) => handleColumnVisibilityChange(id, false)}
                onDeleteColumn={appColumnsHook.handleDeleteAppColumn}
                onRenameColumn={appColumnsHook.handleRenameColumn}
                onCellValueChange={appColumnsHook.handleCellValueUpdate}
                identityKey={dataStatus?.datasetTemplate?.identityKey}
                showAddColumn={!!currentLineageId}
                appRows={appRowsHook.appRows}
                onAddRow={appRowsHook.handleAddRow}
                onDeleteRow={appRowsHook.handleDeleteAppRow}
                onRenameRow={appRowsHook.handleRenameRow}
                onRowCellValueChange={appRowsHook.handleRowCellValueUpdate}
                showAddRow={!!currentLineageId}
                sheets={sheets}
                onSheetChange={handleSheetChange}
                onFormulaColumnSelect={handleOpenFormulaEditor}
                onFormulaRowSelect={handleOpenRowFormulaEditor}
                onEditFormulaColumn={handleEditFormulaColumn}
                onEditFormulaRow={handleEditFormulaRow}
                formulaColumns={formulaColumnsMap}
                cellFormulas={cellFormulasHook.cellFormulas}
                onCellFormulaChange={cellFormulasHook.handleCellFormulaChange}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h4 className="text-sm font-medium text-gray-900 mb-1">
              {currentPeriodLabel ? `No data for ${currentPeriodLabel}` : "No data uploaded yet"}
            </h4>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV or Excel file to add data{currentPeriodLabel ? ` for ${currentPeriodLabel}` : " for this task"}.
            </p>
            {isViewingCurrentPeriod && (
              <Button onClick={() => setIsUploadModalOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Data
              </Button>
            )}
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
        periodLabel={currentPeriodLabel || undefined}
        periodStart={boardPeriodStart || undefined}
        periodEnd={boardPeriodEnd || undefined}
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

      {/* Delete Schema Confirmation */}
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
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSchema} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Schema"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Upload Confirmation */}
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
              {(appColumnsHook.appColumns.length > 0 || appRowsHook.appRows.length > 0) && (
                <span className="block mt-2 text-gray-500">
                  Note: Custom formula columns and rows will be preserved.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDataConfirmOpen(false)} disabled={deletingData}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteData} disabled={deletingData}>
              {deletingData ? "Deleting..." : "Delete Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Formula Editor Modal */}
      <FormulaEditorModal
        open={isFormulaEditorOpen}
        onOpenChange={(open) => {
          setIsFormulaEditorOpen(open)
          if (!open) {
            setEditingFormulaColumnId(null)
            setEditingFormulaRowId(null)
          }
        }}
        mode={formulaEditorMode}
        columns={formulaColumnResources}
        rows={sheetDataHook.snapshotRows.length > 0 
          ? sheetDataHook.snapshotRows.map((row, i) => ({
              index: i,
              label: String(row[dataStatus.datasetTemplate?.identityKey || ""] || `Row ${i + 1}`),
            }))
          : []
        }
        otherSheets={otherSheets}
        sampleRow={sampleRow}
        identityKey={dataStatus.datasetTemplate?.identityKey}
        onSave={formulaEditorMode === "column" ? handleSaveFormulaColumn : handleSaveFormulaRow}
        initialValues={formulaEditorMode === "column" ? editingFormulaColumnData : editingFormulaRowData}
        isEditing={formulaEditorMode === "column" ? !!editingFormulaColumnId : !!editingFormulaRowId}
      />
    </>
  )
}
