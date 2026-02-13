"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { usePermissions } from "@/components/permissions-context"
import {
  ArrowLeft,
  Download,
  Upload,
  FileSpreadsheet,
  Search,
  X,
  ChevronDown,
  Check,
  AlertCircle,
  AlertTriangle,
  FileUp,
  Plus,
  Pencil,
  GripVertical,
  Trash2,
  Save,
  Calendar,
  RefreshCw,
  Loader2,
  Settings,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { SyncFilterEditor } from "@/components/databases/sync-filter-editor"
import type { SyncFilter, FilterableColumn } from "@/components/databases/sync-filter-editor"
import { ViewerManagement, type Viewer } from "@/components/shared/viewer-management"

// ============================================
// Types
// ============================================

interface SchemaColumn {
  key: string
  label: string
  dataType: "text" | "number" | "date" | "boolean" | "currency" | "dropdown"
  required: boolean
  order: number
  dropdownOptions?: string[]
}

interface DatabaseSchema {
  columns: SchemaColumn[]
  version: number
}

interface DatabaseRow {
  [key: string]: string | number | boolean | null
}

interface DatabaseDetail {
  id: string
  name: string
  description: string | null
  schema: DatabaseSchema
  identifierKeys: string[]
  rows: DatabaseRow[]
  rowCount: number
  createdAt: string
  updatedAt: string
  lastImportedAt: string | null
  sourceType: string | null
  syncFilter: SyncFilter[] | null
  isReadOnly: boolean
  syncStatus: string | null
  lastSyncAsOfDate: string | null
  lastSyncError: string | null
  createdBy: {
    name: string | null
    email: string
  }
  lastImportedBy: {
    name: string | null
    email: string
  } | null
  hasGeneratedReports?: boolean
}

interface ColumnFilter {
  columnKey: string
  selectedValues: Set<string>
}

interface ColumnChange {
  columnKey: string
  columnLabel: string
  oldValue: unknown
  newValue: unknown
}

interface UpdateCandidate {
  identifierValues: Record<string, unknown>
  changes: ColumnChange[]
  newRowData: DatabaseRow
  existingRowIndex: number
}

interface ImportPreviewResult {
  valid: boolean
  errors: string[]  // Blocking errors only
  warnings?: string[]  // Non-blocking (validation errors, duplicates)
  rowCount: number
  validRowCount?: number  // Rows that passed validation
  invalidRowCount?: number  // Rows with validation errors (skipped)
  newRowCount: number
  exactDuplicateCount?: number
  updateCandidates?: UpdateCandidate[]
  existingRowCount: number
  totalAfterImport: number
  identifierKeys?: string[]
  schema?: DatabaseSchema
}

// ============================================
// Component
// ============================================

export default function DatabaseDetailPage() {
  const router = useRouter()
  const params = useParams()
  const databaseId = params.id as string
  const { can } = usePermissions()
  const canManage = can("databases:manage")
  const canImport = can("databases:import")

  const [database, setDatabase] = useState<DatabaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewers, setViewers] = useState<Viewer[]>([])

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([])

  // Tab state
  const [activeTab, setActiveTab] = useState<"data" | "schema">("data")

  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Schema editing state
  const [schemaEditMode, setSchemaEditMode] = useState(false)
  const [editingColumns, setEditingColumns] = useState<SchemaColumn[]>([])
  const [savingSchema, setSavingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([])
  const [editingDropdownColumn, setEditingDropdownColumn] = useState<string | null>(null)

  // Sync state (for accounting-sourced databases)
  const [syncAsOfDate, setSyncAsOfDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split("T")[0]
  })
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Configure filters dialog state
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const [editingSyncFilters, setEditingSyncFilters] = useState<SyncFilter[]>([])
  const [sourceColumns, setSourceColumns] = useState<FilterableColumn[]>([])
  const [savingFilters, setSavingFilters] = useState(false)

  // Preview state (in configure dialog)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<{
    rows: DatabaseRow[]
    totalCount: number
  } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // ----------------------------------------
  // Data Fetching
  // ----------------------------------------

  const fetchDatabase = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/databases/${databaseId}`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 404) {
          setError("Database not found")
        } else if (response.status === 401) {
          window.location.href = "/auth/signin?callbackUrl=/dashboard/databases"
          return
        } else {
          const data = await response.json()
          setError(data.error || "Failed to load database")
        }
        return
      }

      const data = await response.json()
      setDatabase(data.database)
      if (data.database?.viewers) {
        setViewers(data.database.viewers.map((v: any) => ({
          userId: v.user.id,
          name: v.user.name,
          email: v.user.email,
        })))
      }
    } catch (err) {
      console.error("Error fetching database:", err)
      setError("Failed to load database")
    } finally {
      setLoading(false)
    }
  }, [databaseId])

  useEffect(() => {
    fetchDatabase()
  }, [fetchDatabase])

  // Poll for sync status when syncing
  useEffect(() => {
    if (database?.syncStatus !== "syncing") return
    const interval = setInterval(fetchDatabase, 5000)
    return () => clearInterval(interval)
  }, [database?.syncStatus, fetchDatabase])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const resp = await fetch(`/api/databases/${databaseId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOfDate: syncAsOfDate }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || "Sync failed")
      }
      const data = await resp.json()
      setSyncMessage({
        type: "success",
        text: `Synced ${data.rowCount.toLocaleString()} total rows as of ${new Date(syncAsOfDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
      })
      await fetchDatabase()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSyncMessage({ type: "error", text: msg })
    } finally {
      setSyncing(false)
    }
  }

  // Fetch source column metadata for filter editing
  useEffect(() => {
    if (!database?.sourceType) return
    async function fetchSourceColumns() {
      try {
        const resp = await fetch("/api/integrations/accounting/sources")
        if (resp.ok) {
          const data = await resp.json()
          const source = (data.sources || []).find(
            (s: { sourceType: string }) => s.sourceType === database?.sourceType
          )
          if (source) {
            setSourceColumns(source.columns)
          }
        }
      } catch (e) {
        console.error("Error fetching source columns:", e)
      }
    }
    fetchSourceColumns()
  }, [database?.sourceType])

  const openFilterDialog = () => {
    setEditingSyncFilters(database?.syncFilter ? [...database.syncFilter] : [])
    setPreviewData(null)
    setPreviewError(null)
    setFilterDialogOpen(true)
  }

  const handlePreviewInDialog = async () => {
    if (!database?.sourceType) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const validFilters = editingSyncFilters.filter((f) => f.column && f.value)
      const resp = await fetch("/api/integrations/accounting/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: database.sourceType,
          syncFilter: validFilters,
        }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || "Preview failed")
      }
      const data = await resp.json()
      setPreviewData(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setPreviewError(msg)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleSaveFilters = async () => {
    if (!database) return
    setSavingFilters(true)
    try {
      const validFilters = editingSyncFilters.filter((f) => f.column && f.value)
      const resp = await fetch(`/api/databases/${databaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncFilter: validFilters.length > 0 ? validFilters : null,
        }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save filters")
      }
      setFilterDialogOpen(false)
      setSyncMessage({
        type: "success",
        text: "Filters updated. Existing data has been cleared — click \"Sync as of\" to re-sync with the new filters.",
      })
      await fetchDatabase()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSyncMessage({ type: "error", text: msg })
    } finally {
      setSavingFilters(false)
    }
  }

  // ----------------------------------------
  // Computed Values
  // ----------------------------------------

  const sortedColumns = useMemo(() => {
    if (!database) return []
    return [...database.schema.columns].sort((a, b) => a.order - b.order)
  }, [database])

  // Identifier keys no longer used - uniqueness determined by all columns

  const getUniqueValues = useCallback(
    (columnKey: string): string[] => {
      if (!database) return []
      const values = new Set<string>()
      database.rows.forEach((row) => {
        const value = row[columnKey]
        if (value !== null && value !== undefined) {
          values.add(String(value))
        }
      })
      return Array.from(values).sort()
    },
    [database]
  )

  const getColumnFilter = (columnKey: string): ColumnFilter | undefined => {
    return columnFilters.find((f) => f.columnKey === columnKey)
  }

  const toggleFilterValue = (columnKey: string, value: string) => {
    setColumnFilters((prev) => {
      const existing = prev.find((f) => f.columnKey === columnKey)
      if (existing) {
        const newSelected = new Set(existing.selectedValues)
        if (newSelected.has(value)) {
          newSelected.delete(value)
        } else {
          newSelected.add(value)
        }
        if (newSelected.size === 0) {
          return prev.filter((f) => f.columnKey !== columnKey)
        }
        return prev.map((f) =>
          f.columnKey === columnKey ? { ...f, selectedValues: newSelected } : f
        )
      } else {
        return [...prev, { columnKey, selectedValues: new Set([value]) }]
      }
    })
  }

  const clearColumnFilter = (columnKey: string) => {
    setColumnFilters((prev) => prev.filter((f) => f.columnKey !== columnKey))
  }

  const filteredRows = useMemo(() => {
    if (!database) return []

    let rows = database.rows

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      rows = rows.filter((row) =>
        Object.values(row).some((value) => {
          if (value === null || value === undefined) return false
          return String(value).toLowerCase().includes(query)
        })
      )
    }

    // Apply column filters
    columnFilters.forEach((filter) => {
      if (filter.selectedValues.size > 0) {
        rows = rows.filter((row) => {
          const value = row[filter.columnKey]
          if (value === null || value === undefined) return false
          return filter.selectedValues.has(String(value))
        })
      }
    })

    return rows
  }, [database, searchQuery, columnFilters])

  // ----------------------------------------
  // Export & Template Handlers
  // ----------------------------------------

  const handleExport = async () => {
    window.open(`/api/databases/${databaseId}/export.xlsx`, "_blank")
  }

  const handleDownloadTemplate = async () => {
    window.open(`/api/databases/${databaseId}/template.xlsx`, "_blank")
  }

  // ----------------------------------------
  // Import Handlers
  // ----------------------------------------

  const handleImportClick = () => {
    setImportModalOpen(true)
    setImportFile(null)
    setImportPreview(null)
    setAcknowledgedWarnings(false)
  }

  const handleFileSelect = async (file: File) => {
    setImportFile(file)
    setImportPreview(null)
    setAcknowledgedWarnings(false)
    setPreviewing(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch(`/api/databases/${databaseId}/import/preview`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      const result = await response.json()
      setImportPreview(result)
    } catch (err) {
      console.error("Error previewing import:", err)
      setImportPreview({
        valid: false,
        errors: ["Failed to preview file"],
        rowCount: 0,
        newRowCount: 0,
        exactDuplicateCount: 0,
        existingRowCount: database?.rowCount || 0,
        totalAfterImport: database?.rowCount || 0,
      })
    } finally {
      setPreviewing(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!importFile) return

    setImporting(true)

    try {
      const formData = new FormData()
      formData.append("file", importFile)
      formData.append("updateExisting", String(updateExisting))

      const response = await fetch(`/api/databases/${databaseId}/import`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        setImportModalOpen(false)
        setImportFile(null)
        setImportPreview(null)
        setUpdateExisting(false)
        // Refresh the database data
        fetchDatabase()
      } else {
        setImportPreview({
          valid: false,
          errors: result.errors || [result.error || "Import failed"],
          rowCount: importPreview?.rowCount || 0,
          newRowCount: 0,
          exactDuplicateCount: result.duplicates || 0,
          existingRowCount: database?.rowCount || 0,
          totalAfterImport: database?.rowCount || 0,
        })
      }
    } catch (err) {
      console.error("Error importing:", err)
      setImportPreview({
        valid: false,
        errors: ["Failed to import data"],
        rowCount: importPreview?.rowCount || 0,
        newRowCount: 0,
        exactDuplicateCount: 0,
        existingRowCount: database?.rowCount || 0,
        totalAfterImport: database?.rowCount || 0,
      })
    } finally {
      setImporting(false)
    }
  }

  // ----------------------------------------
  // Schema Edit Handlers
  // ----------------------------------------

  const startSchemaEdit = () => {
    if (!database) return
    setEditingColumns([...database.schema.columns].sort((a, b) => a.order - b.order))
    setSchemaError(null)
    setSchemaWarnings([])
    setSchemaEditMode(true)
  }

  const cancelSchemaEdit = () => {
    setSchemaEditMode(false)
    setEditingColumns([])
    setSchemaError(null)
    setSchemaWarnings([])
  }

  const updateColumnField = (key: string, field: keyof SchemaColumn, value: any) => {
    setEditingColumns(prev => 
      prev.map(col => col.key === key ? { ...col, [field]: value } : col)
    )
  }

  const moveColumn = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= editingColumns.length) return
    
    const newColumns = [...editingColumns]
    const [removed] = newColumns.splice(index, 1)
    newColumns.splice(newIndex, 0, removed)
    
    // Update order values
    setEditingColumns(newColumns.map((col, i) => ({ ...col, order: i })))
  }

  const addColumn = () => {
    const newKey = `column_${Date.now()}`
    const newColumn: SchemaColumn = {
      key: newKey,
      label: "New Column",
      dataType: "text",
      required: false,
      order: editingColumns.length,
    }
    setEditingColumns(prev => [...prev, newColumn])
  }

  const removeColumn = (key: string) => {
    if (!database) return
    // Can't remove if reports have been generated
    if (database.hasGeneratedReports) {
      setSchemaError("Cannot remove columns when reports have been generated using this database")
      return
    }
    setEditingColumns(prev => prev.filter(c => c.key !== key).map((col, i) => ({ ...col, order: i })))
    setSchemaError(null)
  }

  const saveSchema = async () => {
    if (!database) return

    // Client-side duplicate label check for immediate feedback
    const labelSet = new Set<string>()
    for (const col of editingColumns) {
      const normalized = col.label.trim().toLowerCase()
      if (labelSet.has(normalized)) {
        setSchemaError(`Duplicate column label: "${col.label}". Column labels must be unique.`)
        return
      }
      labelSet.add(normalized)
    }

    setSavingSchema(true)
    setSchemaError(null)
    setSchemaWarnings([])

    try {
      const response = await fetch(`/api/databases/${databaseId}/schema`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          columns: editingColumns,
        }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        setSchemaError(result.error || "Failed to update schema")
        return
      }
      
      if (result.warnings?.length > 0) {
        setSchemaWarnings(result.warnings)
      }
      
      // Success - refresh and exit edit mode
      await fetchDatabase()
      setSchemaEditMode(false)
    } catch (err) {
      console.error("Error saving schema:", err)
      setSchemaError("Failed to save schema")
    } finally {
      setSavingSchema(false)
    }
  }

  // ----------------------------------------
  // Format Helpers
  // ----------------------------------------

  const formatCellValue = (
    value: string | number | boolean | null,
    dataType: string
  ): string => {
    if (value === null || value === undefined || value === "") return "—"

    switch (dataType) {
      case "boolean":
        return value ? "Yes" : "No"
      case "currency": {
        // Parse string values to numbers for formatting
        const numValue = typeof value === "number" ? value : parseFloat(String(value).replace(/[$,]/g, ""))
        if (!isNaN(numValue)) {
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(numValue)
        }
        return String(value)
      }
      case "number": {
        // Parse string values to numbers for formatting
        const numValue = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""))
        if (!isNaN(numValue)) {
          return new Intl.NumberFormat("en-US").format(numValue)
        }
        return String(value)
      }
      case "date":
        if (value) {
          try {
            return new Date(String(value)).toLocaleDateString()
          } catch {
            return String(value)
          }
        }
        return "—"
      default:
        return String(value)
    }
  }

  // ----------------------------------------
  // Render
  // ----------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    )
  }

  if (error || !database) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-center">
            <h1 className="text-xl font-medium text-gray-900">
              {error || "Database not found"}
            </h1>
            <Link href="/dashboard/databases" className="mt-4 inline-block">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Databases
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/databases">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-gray-900">
                    {database.name}
                  </h1>
                  {database.sourceType && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                      Synced
                    </span>
                  )}
                </div>
                {database.description && (
                  <p className="text-sm text-gray-500">{database.description}</p>
                )}
                {/* Sync filter badges */}
                {database.sourceType && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {database.syncFilter && database.syncFilter.length > 0 ? (
                      <>
                        {database.syncFilter.map((f, i) => {
                          const colDef = sourceColumns.find((c) => c.key === f.column)
                          return (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded"
                            >
                              {colDef?.label || f.column} = {f.value}
                            </span>
                          )
                        })}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">No filters</span>
                    )}
                    <button
                      onClick={openFilterDialog}
                      className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Configure filters"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Sync controls for accounting-sourced databases */}
              {database.sourceType && (
                <>
                  {database.lastSyncAsOfDate && (
                    <span className="text-xs text-gray-500 mr-1">
                      Last synced: {new Date(database.lastSyncAsOfDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                  {!database.lastSyncAsOfDate && (
                    <span className="text-xs text-gray-400 mr-1">
                      Not yet synced
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="date"
                      value={syncAsOfDate}
                      onChange={(e) => setSyncAsOfDate(e.target.value)}
                      className="text-xs bg-transparent border-none outline-none text-gray-700 w-[110px]"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing || database.syncStatus === "syncing"}
                    className="bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    {syncing || database.syncStatus === "syncing" ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {syncing || database.syncStatus === "syncing"
                      ? "Syncing..."
                      : `Sync as of ${new Date(syncAsOfDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </Button>
                </>
              )}
              {/* Standard buttons for non-synced databases */}
              {!database.isReadOnly && !database.sourceType && (
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="w-4 h-4 mr-1.5" />
                  Template
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExport}>
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Export
              </Button>
              {!database.isReadOnly && !database.sourceType && canImport && (
                <Button
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleImportClick}
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  Import
                </Button>
              )}
            </div>
          </div>

          {/* Sync status message */}
          {syncMessage && (
            <div
              className={`mt-3 px-3 py-2 rounded-lg text-sm ${
                syncMessage.type === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {syncMessage.text}
            </div>
          )}
          {database.lastSyncError && !syncMessage && (
            <div className="mt-3 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
              Last sync error: {database.lastSyncError}
            </div>
          )}

          {/* Row capacity warning */}
          {database.rowCount >= 8000 && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
              database.rowCount >= 10000
                ? "bg-red-50 text-red-800 border border-red-200"
                : database.rowCount >= 9000
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-yellow-50 text-yellow-800 border border-yellow-200"
            }`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                {database.rowCount >= 10000
                  ? `This database has reached the ${(10000).toLocaleString()} row limit. New imports will be rejected until rows are removed.`
                  : `This database is at ${Math.round((database.rowCount / 10000) * 100)}% capacity (${database.rowCount.toLocaleString()} / ${(10000).toLocaleString()} rows).`
                }
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-6 mt-4 border-b border-gray-200 -mb-px">
            <button
              onClick={() => setActiveTab("data")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "data"
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Data ({database.rowCount.toLocaleString()} rows)
            </button>
            <button
              onClick={() => setActiveTab("schema")}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "schema"
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Schema ({sortedColumns.length} columns)
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "data" ? (
          <>
            {/* Search and filter bar */}
            <div className="mb-4 flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search all columns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
              {columnFilters.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColumnFilters([])}
                >
                  Clear all filters
                </Button>
              )}
            </div>

            {/* Active filters display */}
            {columnFilters.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {columnFilters.map((filter) => {
                  const column = sortedColumns.find(
                    (c) => c.key === filter.columnKey
                  )
                  return (
                    <div
                      key={filter.columnKey}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded text-sm"
                    >
                      <span className="font-medium">{column?.label}:</span>
                      <span>{Array.from(filter.selectedValues).join(", ")}</span>
                      <button
                        onClick={() => clearColumnFilter(filter.columnKey)}
                        className="ml-1 hover:text-orange-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Data table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {sortedColumns.map((column) => {
                        const filter = getColumnFilter(column.key)
                        const hasFilter = filter && filter.selectedValues.size > 0
                        const uniqueValues = getUniqueValues(column.key)

                        return (
                          <th
                            key={column.key}
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className={`inline-flex items-center gap-1 hover:text-gray-700 ${
                                    hasFilter ? "text-orange-600" : ""
                                  }`}
                                >
                                  {column.label}
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className="w-56 max-h-64 overflow-y-auto"
                              >
                                {hasFilter && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => clearColumnFilter(column.key)}
                                    >
                                      Clear filter
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {uniqueValues.length === 0 ? (
                                  <div className="px-2 py-1.5 text-sm text-gray-500">
                                    No values
                                  </div>
                                ) : (
                                  uniqueValues.slice(0, 50).map((value) => (
                                    <DropdownMenuItem
                                      key={value}
                                      onClick={() =>
                                        toggleFilterValue(column.key, value)
                                      }
                                    >
                                      <div className="flex items-center gap-2 w-full">
                                        <div
                                          className={`w-4 h-4 border rounded flex items-center justify-center ${
                                            filter?.selectedValues.has(value)
                                              ? "bg-orange-500 border-orange-500"
                                              : "border-gray-300"
                                          }`}
                                        >
                                          {filter?.selectedValues.has(value) && (
                                            <Check className="w-3 h-3 text-white" />
                                          )}
                                        </div>
                                        <span className="truncate">{value}</span>
                                      </div>
                                    </DropdownMenuItem>
                                  ))
                                )}
                                {uniqueValues.length > 50 && (
                                  <div className="px-2 py-1.5 text-xs text-gray-400">
                                    +{uniqueValues.length - 50} more values
                                  </div>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={sortedColumns.length}
                          className="px-4 py-8 text-center text-gray-500"
                        >
                          {database.rowCount === 0
                            ? "No data yet. Import data to get started."
                            : "No rows match your filters."}
                        </td>
                      </tr>
                    ) : (
                      filteredRows.slice(0, 100).map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                          {sortedColumns.map((column) => (
                            <td
                              key={column.key}
                              className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                            >
                              {formatCellValue(row[column.key], column.dataType)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 100 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
                  Showing first 100 of {filteredRows.length.toLocaleString()} rows
                </div>
              )}
            </div>
          </>
        ) : (
          /* Schema tab */
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Schema Definition</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {schemaEditMode ? "Edit the structure of this database" : "View the structure of this database"}
                </p>
              </div>
              {!schemaEditMode && !database.isReadOnly && canManage ? (
                <Button variant="outline" size="sm" onClick={startSchemaEdit}>
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit Schema
                </Button>
              ) : schemaEditMode ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={cancelSchemaEdit} disabled={savingSchema}>
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={saveSchema}
                    disabled={savingSchema}
                  >
                    {savingSchema ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1.5" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Error/Warning messages */}
            {schemaError && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{schemaError}</p>
              </div>
            )}
            {schemaWarnings.length > 0 && (
              <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-700">Warnings</p>
                    <ul className="mt-1 text-sm text-amber-600 space-y-0.5">
                      {schemaWarnings.map((warn, i) => (
                        <li key={i}>• {warn}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {schemaEditMode && (
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                        
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Label
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Required
                    </th>
                    {schemaEditMode && (
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                        
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(schemaEditMode ? editingColumns : sortedColumns).map((column, index) => (
                    <tr key={column.key} className={schemaEditMode ? "hover:bg-gray-50" : ""}>
                      {schemaEditMode && (
                        <td className="px-3 py-4">
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => moveColumn(index, "up")}
                              disabled={index === 0}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            >
                              <ChevronDown className="w-4 h-4 rotate-180" />
                            </button>
                            <button
                              onClick={() => moveColumn(index, "down")}
                              disabled={index === editingColumns.length - 1}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {column.order + 1}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {schemaEditMode ? (
                          <Input
                            value={column.label}
                            onChange={(e) => updateColumnField(column.key, "label", e.target.value)}
                            className="h-8 w-40"
                          />
                        ) : (
                          column.label
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 capitalize">
                        {schemaEditMode ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={column.dataType}
                              onChange={(e) => {
                                const newType = e.target.value
                                updateColumnField(column.key, "dataType", newType)
                                // Initialize dropdownOptions if switching to dropdown
                                if (newType === "dropdown" && !column.dropdownOptions) {
                                  updateColumnField(column.key, "dropdownOptions", [])
                                }
                              }}
                              className="h-8 px-2 border border-gray-300 rounded-md text-sm"
                            >
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="currency">Currency</option>
                              <option value="date">Date</option>
                              <option value="boolean">Boolean</option>
                              <option value="dropdown">Dropdown</option>
                              <option value="file">File Attachment</option>
                            </select>
                            {column.dataType === "dropdown" && (
                              <button
                                type="button"
                                onClick={() => setEditingDropdownColumn(column.key)}
                                className="text-xs text-orange-600 hover:text-orange-700 hover:underline whitespace-nowrap"
                              >
                                {(column.dropdownOptions?.length || 0)} options
                              </button>
                            )}
                          </div>
                        ) : (
                          <span>
                            {column.dataType}
                            {column.dataType === "dropdown" && column.dropdownOptions && (
                              <span className="ml-1 text-gray-400">
                                ({column.dropdownOptions.length})
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {schemaEditMode ? (
                          <button
                            onClick={() => updateColumnField(column.key, "required", !column.required)}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              column.required
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {column.required ? "Yes" : "No"}
                          </button>
                        ) : column.required ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Yes
                          </span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </td>
                      {schemaEditMode && (
                        <td className="px-3 py-4">
                          <button
                            onClick={() => removeColumn(column.key)}
                            disabled={database.hasGeneratedReports}
                            className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={
                              database.hasGeneratedReports 
                                ? "Cannot remove columns when reports have been generated" 
                                : "Remove column"
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add column button (edit mode only - always allowed) */}
            {schemaEditMode && (
              <div className="px-6 py-4 border-t border-gray-200">
                <Button variant="outline" size="sm" onClick={addColumn}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Column
                </Button>
              </div>
            )}

            {/* Edit mode restrictions notice */}
            {schemaEditMode && database.hasGeneratedReports && (
              <div className="px-6 py-4 bg-amber-50 border-t border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-700">
                    <p className="font-medium">Limited editing</p>
                    <p>Reports have been generated using this database. You can add new columns and edit labels/data types, but cannot remove columns.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Uniqueness info */}
            {!schemaEditMode && (
              <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-700">Row Uniqueness</p>
                    <p className="text-sm text-blue-600">
                      Each row is uniquely identified by the combination of ALL column values. 
                      Duplicate rows (where every column matches) are automatically skipped during import.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Viewer Management */}
        <div className="mt-6">
          <ViewerManagement
            entityType="databases"
            entityId={databaseId}
            viewers={viewers}
            onViewersChange={setViewers}
          />
        </div>
      </div>

      {/* Import Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Data</DialogTitle>
            <DialogDescription>
              Upload an Excel file to add new rows. Duplicate entries (based on identifier columns) will be rejected.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {!importFile ? (
              /* File drop zone */
              <div
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files[0]
                  if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
                    handleFileSelect(file)
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-orange-400 hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                  }}
                  className="hidden"
                  ref={fileInputRef}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <FileUp className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">
                    Drop an Excel file here or{" "}
                    <span className="text-orange-600 font-medium">browse</span>
                  </p>
                  <p className="text-sm text-gray-400 mt-1">.xlsx or .xls files</p>
                </button>
              </div>
            ) : previewing ? (
              /* Loading state */
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3" />
                <p className="text-gray-600">Validating file...</p>
              </div>
            ) : importPreview ? (
              /* Preview result */
              <div className="space-y-4">
                {/* File info */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5 text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-700 truncate">{importFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {importPreview.rowCount.toLocaleString()} rows in file
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImportFile(null)
                      setImportPreview(null)
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* New rows summary */}
                {importPreview.newRowCount > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <Plus className="w-4 h-4 text-green-600 mt-0.5" />
                    <div className="text-sm text-green-700">
                      <strong>{importPreview.newRowCount.toLocaleString()}</strong> new row(s) will be added
                    </div>
                  </div>
                )}

                {/* Exact duplicates info */}
                {(importPreview.exactDuplicateCount || 0) > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <Check className="w-4 h-4 text-gray-500 mt-0.5" />
                    <p className="text-sm text-gray-600">
                      <strong>{importPreview.exactDuplicateCount?.toLocaleString()}</strong> identical row(s) will be skipped (already exist)
                    </p>
                  </div>
                )}

                {/* Update candidates section */}
                {importPreview.updateCandidates && importPreview.updateCandidates.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-700">
                          {importPreview.updateCandidates.length} row(s) have changes
                        </p>
                        <p className="text-sm text-amber-600 mt-1">
                          These rows match existing data by identifier but have different values:
                        </p>
                      </div>
                    </div>

                    {/* Show first 5 update candidates with diffs */}
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {importPreview.updateCandidates.slice(0, 5).map((candidate, idx) => (
                        <div key={idx} className="bg-white rounded border border-amber-200 p-3 text-sm">
                          <p className="font-medium text-gray-700 mb-2">
                            Row: {Object.entries(candidate.identifierValues).map(([k, v]) => 
                              `${k}="${v}"`
                            ).join(", ")}
                          </p>
                          <div className="space-y-1">
                            {candidate.changes.map((change, cIdx) => (
                              <div key={cIdx} className="flex items-center gap-2 text-xs">
                                <span className="font-medium text-gray-600">{change.columnLabel}:</span>
                                <span className="text-red-600 line-through">
                                  {String(change.oldValue ?? "—")}
                                </span>
                                <span className="text-gray-400">→</span>
                                <span className="text-green-600 font-medium">
                                  {String(change.newValue ?? "—")}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {importPreview.updateCandidates.length > 5 && (
                        <p className="text-xs text-amber-600 text-center">
                          ...and {importPreview.updateCandidates.length - 5} more rows with changes
                        </p>
                      )}
                    </div>

                    {/* Update checkbox */}
                    <label className="flex items-center gap-2 pt-2 border-t border-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={updateExisting}
                        onChange={(e) => setUpdateExisting(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-sm font-medium text-amber-800">
                        Update existing rows with new values
                      </span>
                    </label>
                  </div>
                )}

                {/* Validation errors */}
                {importPreview.errors.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-700">Cannot import</p>
                        <ul className="mt-1 text-sm text-red-600 space-y-0.5">
                          {importPreview.errors.slice(0, 10).map((err, i) => (
                            <li key={i}>• {err}</li>
                          ))}
                          {importPreview.errors.length > 10 && (
                            <li className="text-red-500">
                              ... and {importPreview.errors.length - 10} more errors
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warnings — require acknowledgment before import */}
                {importPreview.warnings && importPreview.warnings.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-700">
                          Rows will be skipped
                        </p>
                        <ul className="mt-1 text-sm text-amber-600 space-y-0.5">
                          {importPreview.warnings.map((warn, i) => (
                            <li key={i}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 pt-2 border-t border-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acknowledgedWarnings}
                        onChange={(e) => setAcknowledgedWarnings(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-sm font-medium text-amber-800">
                        I understand that {(importPreview.invalidRowCount || 0) + (importPreview.exactDuplicateCount || 0)} row(s) will be skipped
                      </span>
                    </label>
                  </div>
                )}

                {/* Valid preview summary */}
                {importPreview.valid && (importPreview.newRowCount > 0 || (updateExisting && (importPreview.updateCandidates?.length || 0) > 0)) && (
                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <Check className="w-4 h-4 text-blue-600 mt-0.5" />
                    <p className="text-sm text-blue-700">
                      File is valid and ready to import
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportModalOpen(false)
                setImportFile(null)
                setImportPreview(null)
                setUpdateExisting(false)
                setAcknowledgedWarnings(false)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={
                !importPreview?.valid ||
                importing ||
                ((importPreview?.newRowCount || 0) === 0 && (!updateExisting || (importPreview?.updateCandidates?.length || 0) === 0)) ||
                (((importPreview?.warnings?.length || 0) > 0) && !acknowledgedWarnings)
              }
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Importing...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  {(() => {
                    const parts: string[] = []
                    if ((importPreview?.newRowCount || 0) > 0) {
                      parts.push(`Add ${importPreview?.newRowCount?.toLocaleString()}`)
                    }
                    if (updateExisting && (importPreview?.updateCandidates?.length || 0) > 0) {
                      parts.push(`Update ${importPreview?.updateCandidates?.length?.toLocaleString()}`)
                    }
                    return parts.length > 0 ? `${parts.join(" + ")} Rows` : "No Changes"
                  })()}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Filters Dialog */}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Configure Sync Filters</DialogTitle>
            <DialogDescription>
              Change which rows are included when syncing data from your accounting software.
              Changing filters will clear all existing data.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <SyncFilterEditor
              filters={editingSyncFilters}
              onChange={setEditingSyncFilters}
              columns={sourceColumns}
            />

            {/* Preview section */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Data Preview</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviewInDialog}
                  disabled={previewLoading}
                >
                  {previewLoading ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Preview Data
                </Button>
              </div>
              {previewError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  {previewError}
                </div>
              )}
              {previewData && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {previewData.rows.length > 0 &&
                            Object.keys(previewData.rows[0]).slice(0, 8).map((key) => (
                              <th key={key} className="px-2 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">
                                {key}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {previewData.rows.slice(0, 10).map((row, i) => (
                          <tr key={i}>
                            {Object.keys(previewData.rows[0]).slice(0, 8).map((key) => (
                              <td key={key} className="px-2 py-1.5 text-gray-700 whitespace-nowrap max-w-[150px] truncate">
                                {String(row[key] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-2 py-1.5 bg-gray-50 border-t text-xs text-gray-500">
                    Showing {Math.min(previewData.rows.length, 10)} of {previewData.totalCount.toLocaleString()} total rows
                  </div>
                </div>
              )}
            </div>

            {/* Warning */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Saving new filters will <strong>clear all existing data</strong> from this database. You will need to re-sync after saving.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFilterDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveFilters}
              disabled={savingFilters}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {savingFilters ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1.5" />
              )}
              Save &amp; Clear Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dropdown Options Dialog */}
      <Dialog 
        open={editingDropdownColumn !== null} 
        onOpenChange={(open) => !open && setEditingDropdownColumn(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dropdown Options</DialogTitle>
            <DialogDescription>
              Enter the allowed values for this dropdown field, one per line.
            </DialogDescription>
          </DialogHeader>
          {editingDropdownColumn && (
            <div className="py-4">
              <textarea
                value={(editingColumns.find(c => c.key === editingDropdownColumn)?.dropdownOptions || []).join("\n")}
                onChange={(e) => {
                  const options = e.target.value
                    .split("\n")
                    .map(o => o.trim())
                    .filter(o => o.length > 0)
                  updateColumnField(editingDropdownColumn, "dropdownOptions", options)
                }}
                placeholder="Option 1&#10;Option 2&#10;Option 3"
                rows={8}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
              />
              <p className="mt-2 text-xs text-gray-500">
                {(editingColumns.find(c => c.key === editingDropdownColumn)?.dropdownOptions || []).length} options defined
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setEditingDropdownColumn(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
