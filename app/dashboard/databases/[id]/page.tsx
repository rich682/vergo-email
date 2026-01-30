"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
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
  Key,
  Plus,
  Pencil,
  GripVertical,
  Trash2,
  Save,
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

// ============================================
// Types
// ============================================

interface SchemaColumn {
  key: string
  label: string
  dataType: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
  order: number
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

  const [database, setDatabase] = useState<DatabaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Schema editing state
  const [schemaEditMode, setSchemaEditMode] = useState(false)
  const [editingColumns, setEditingColumns] = useState<SchemaColumn[]>([])
  const [editingIdentifierKeys, setEditingIdentifierKeys] = useState<string[]>([])
  const [savingSchema, setSavingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [schemaWarnings, setSchemaWarnings] = useState<string[]>([])

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

  // ----------------------------------------
  // Computed Values
  // ----------------------------------------

  const sortedColumns = useMemo(() => {
    if (!database) return []
    return [...database.schema.columns].sort((a, b) => a.order - b.order)
  }, [database])

  const identifierKeySet = useMemo(() => {
    if (!database) return new Set<string>()
    return new Set(database.identifierKeys)
  }, [database])

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
  }

  const handleFileSelect = async (file: File) => {
    setImportFile(file)
    setImportPreview(null)
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
    setEditingIdentifierKeys([...database.identifierKeys])
    setSchemaError(null)
    setSchemaWarnings([])
    setSchemaEditMode(true)
  }

  const cancelSchemaEdit = () => {
    setSchemaEditMode(false)
    setEditingColumns([])
    setEditingIdentifierKeys([])
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

  const toggleIdentifier = (key: string) => {
    if (!database || database.hasGeneratedReports) return // Can't change identifiers if reports have been generated
    
    setEditingIdentifierKeys(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key)
      } else {
        return [...prev, key]
      }
    })
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
    // Can't remove identifier columns
    if (editingIdentifierKeys.includes(key)) {
      setSchemaError("Cannot remove identifier columns. Remove as identifier first.")
      return
    }
    setEditingColumns(prev => prev.filter(c => c.key !== key).map((col, i) => ({ ...col, order: i })))
    setSchemaError(null)
  }

  const saveSchema = async () => {
    if (!database) return
    
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
          identifierKeys: editingIdentifierKeys,
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    )
  }

  if (error || !database) {
    return (
      <div className="min-h-screen bg-gray-50">
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
    <div className="min-h-screen bg-gray-50">
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
                <h1 className="text-xl font-semibold text-gray-900">
                  {database.name}
                </h1>
                {database.description && (
                  <p className="text-sm text-gray-500">{database.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="w-4 h-4 mr-1.5" />
                Template
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Export
              </Button>
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleImportClick}
              >
                <Upload className="w-4 h-4 mr-1.5" />
                Import
              </Button>
            </div>
          </div>

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
                        const isIdentifier = identifierKeySet.has(column.key)

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
                                  {isIdentifier && (
                                    <Key className="w-3 h-3 ml-1 text-orange-500" />
                                  )}
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
              {!schemaEditMode ? (
                <Button variant="outline" size="sm" onClick={startSchemaEdit}>
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit Schema
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={cancelSchemaEdit} disabled={savingSchema}>
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={saveSchema}
                    disabled={savingSchema || editingIdentifierKeys.length === 0}
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
              )}
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Identifier
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
                          <select
                            value={column.dataType}
                            onChange={(e) => updateColumnField(column.key, "dataType", e.target.value)}
                            className="h-8 px-2 border border-gray-300 rounded-md text-sm"
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="currency">Currency</option>
                            <option value="date">Date</option>
                            <option value="boolean">Boolean</option>
                          </select>
                        ) : (
                          column.dataType
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
                      <td className="px-6 py-4 text-sm">
                        {schemaEditMode ? (
                          <button
                            onClick={() => toggleIdentifier(column.key)}
                            disabled={database.hasGeneratedReports}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                              editingIdentifierKeys.includes(column.key)
                                ? "bg-orange-100 text-orange-800"
                                : "bg-gray-100 text-gray-500"
                            } ${database.hasGeneratedReports ? "opacity-50 cursor-not-allowed" : ""}`}
                            title={database.hasGeneratedReports ? "Cannot change identifiers when reports have been generated" : ""}
                          >
                            <Key className="w-3 h-3" />
                            {editingIdentifierKeys.includes(column.key) ? "Key" : "—"}
                          </button>
                        ) : identifierKeySet.has(column.key) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                            <Key className="w-3 h-3" />
                            Key
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      {schemaEditMode && (
                        <td className="px-3 py-4">
                          <button
                            onClick={() => removeColumn(column.key)}
                            disabled={database.hasGeneratedReports || editingIdentifierKeys.includes(column.key)}
                            className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={
                              database.hasGeneratedReports 
                                ? "Cannot remove columns when reports have been generated" 
                                : editingIdentifierKeys.includes(column.key)
                                ? "Cannot remove identifier columns"
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
                    <p>Reports have been generated using this database. You can add new columns and edit labels/data types, but cannot remove columns or change identifier keys.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Composite key info */}
            {!schemaEditMode && database.identifierKeys.length > 1 && (
              <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
                <div className="flex items-start gap-2">
                  <Key className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-700">Composite Identifier</p>
                    <p className="text-sm text-blue-600">
                      Rows are uniquely identified by the combination of: {" "}
                      {database.identifierKeys.map((key, i) => {
                        const col = sortedColumns.find(c => c.key === key)
                        return (
                          <span key={key}>
                            {i > 0 && " + "}
                            <strong>{col?.label || key}</strong>
                          </span>
                        )
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Identifier requirement notice in edit mode */}
            {schemaEditMode && editingIdentifierKeys.length === 0 && (
              <div className="px-6 py-4 bg-red-50 border-t border-red-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                  <p className="text-sm text-red-700">
                    <strong>At least one identifier column is required.</strong> Click on a column's Key badge to toggle it as an identifier.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
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

                {/* Warnings */}
                {importPreview.warnings && importPreview.warnings.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-700">Warnings</p>
                        <ul className="mt-1 text-sm text-amber-600 space-y-0.5">
                          {importPreview.warnings.map((warn, i) => (
                            <li key={i}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
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
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={
                !importPreview?.valid || 
                importing || 
                ((importPreview?.newRowCount || 0) === 0 && (!updateExisting || (importPreview?.updateCandidates?.length || 0) === 0))
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
    </div>
  )
}
