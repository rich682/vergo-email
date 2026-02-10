"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Save,
  Loader2,
  Database,
  Plus,
  Trash2,
  FunctionSquare,
  ChevronDown,
  ChevronRight,
  Settings2,
  LayoutGrid,
  Table2,
  Calendar,
  RefreshCw,
  TrendingUp,
  Filter,
  Pencil,
  MoreVertical,
  AlertTriangle,
  GripVertical,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Types
interface ReportColumn {
  key: string
  label: string
  type: "source" | "formula"
  sourceColumnKey?: string
  expression?: string
  dataType: "text" | "number" | "currency" | "date" | "boolean"
  width?: number
  order: number
}

interface ReportFormulaRow {
  key: string
  label: string
  columnFormulas: Record<string, string>
  order: number
}

// Metric row for pivot layout
interface MetricRow {
  key: string
  label: string
  type: "source" | "formula" | "comparison"
  sourceColumnKey?: string
  expression?: string
  // Comparison fields
  compareRowKey?: string
  comparePeriod?: "mom" | "qoq" | "yoy"
  compareOutput?: "value" | "delta" | "percent"
  format: "text" | "number" | "currency" | "percent"
  order: number
}

// Formula column for pivot layout - computed columns that aggregate across pivot columns
interface PivotFormulaColumn {
  key: string
  label: string
  expression: string  // "SUM(*)" or "[Col A] + [Col B]"
  order: number
}

interface DatabaseSchema {
  columns: Array<{
    key: string
    label: string
    dataType: string
    required: boolean
  }>
}

interface ReportDefinition {
  id: string
  name: string
  description: string | null
  cadence: string
  dateColumnKey: string
  layout: "standard" | "pivot" | "accounting"
  compareMode: "none" | "mom" | "yoy"
  // Standard layout fields
  columns: ReportColumn[]
  formulaRows: ReportFormulaRow[]
  // Pivot layout fields
  pivotColumnKey: string | null
  metricRows: MetricRow[]
  pivotFormulaColumns: PivotFormulaColumn[]  // Formula columns for pivot layout
  // Accounting layout fields
  rowColumnKey: string | null
  valueColumnKey: string | null
  database: {
    id: string
    name: string
    schema: DatabaseSchema
    rowCount: number
    rows: Array<Record<string, unknown>>
  }
}

// Preview result from server
interface PreviewResult {
  current: { periodKey: string; label: string; rowCount: number } | null
  compare: { periodKey: string; label: string; rowCount: number } | null
  availablePeriods: Array<{ key: string; label: string }>
  table: {
    columns: Array<{ key: string; label: string; dataType: string; type: string }>
    rows: Array<Record<string, unknown>>
    formulaRows: Array<{ key: string; label: string; values: Record<string, unknown> }>
  }
  diagnostics: {
    totalDatabaseRows: number
    parseFailures: number
    warnings: string[]
  }
}

const CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
}

export default function ReportBuilderPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  // Report state
  const [report, setReport] = useState<ReportDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preview state (server-side computed)
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [currentPeriodKey, setCurrentPeriodKey] = useState<string>("")
  const [compareMode, setCompareMode] = useState<"none" | "mom" | "yoy">("none")

  // UI state
  const [columnsExpanded, setColumnsExpanded] = useState(true)
  const [formulaRowsExpanded, setFormulaRowsExpanded] = useState(true)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const initialLoadRef = useRef(true)

  // Modal state
  const [formulaColumnPanel, setFormulaColumnPanel] = useState<{
    open: boolean
    editingKey: string | null  // null = new, string = editing existing
  }>({ open: false, editingKey: null })
  const [formulaRowModal, setFormulaRowModal] = useState<{
    open: boolean
    editingKey: string | null
  }>({ open: false, editingKey: null })
  const [metricRowModal, setMetricRowModal] = useState<{
    open: boolean
    editingKey: string | null  // null = new row, string = editing existing
  }>({ open: false, editingKey: null })
  const [pivotFormulaColumnModal, setPivotFormulaColumnModal] = useState<{
    open: boolean
    editingKey: string | null
  }>({ open: false, editingKey: null })
  // Editing state - Standard layout
  const [reportColumns, setReportColumns] = useState<ReportColumn[]>([])
  const [reportFormulaRows, setReportFormulaRows] = useState<ReportFormulaRow[]>([])
  
  // Editing state - Pivot layout
  const [pivotColumnKey, setPivotColumnKey] = useState<string | null>(null)
  const [metricRows, setMetricRows] = useState<MetricRow[]>([])
  const [pivotFormulaColumns, setPivotFormulaColumns] = useState<PivotFormulaColumn[]>([])

  // Filter column configuration - which database columns are exposed as filters
  const [filterColumnKeys, setFilterColumnKeys] = useState<string[]>([])
  const [filterConfigOpen, setFilterConfigOpen] = useState(false)

  // Fetch report definition
  const fetchReport = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports/${id}`, { credentials: "include" })
      if (!response.ok) {
        if (response.status === 404) {
          router.push("/dashboard/reports")
          return
        }
        throw new Error("Failed to load report")
      }
      const data = await response.json()
      setReport(data.report)
      // Standard layout state
      setReportColumns(data.report.columns || [])
      setReportFormulaRows(data.report.formulaRows || [])
      // Pivot layout state
      setPivotColumnKey(data.report.pivotColumnKey || null)
      setMetricRows(data.report.metricRows || [])
      setPivotFormulaColumns(data.report.pivotFormulaColumns || [])
      // Variance state
      setCompareMode(data.report.compareMode || "none")
      // Filter column configuration
      setFilterColumnKeys(data.report.filterColumnKeys || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // Fetch preview from server
  // For pivot layout, auto-detect compare mode from comparison rows
  const effectiveCompareMode = useMemo(() => {
    if (report?.layout === "pivot") {
      // Find comparison rows and their periods
      const comparisonRows = metricRows.filter(m => m.type === "comparison" && m.comparePeriod)
      if (comparisonRows.length > 0) {
        // Use the first comparison period found (prefer yoy > qoq > mom)
        const periods = comparisonRows.map(r => r.comparePeriod)
        if (periods.includes("yoy")) return "yoy"
        if (periods.includes("qoq")) return "mom" // Use mom for qoq since we don't have qoq in compareMode
        if (periods.includes("mom")) return "mom"
      }
      return "none"
    }
    return compareMode
  }, [report?.layout, metricRows, compareMode])

  const fetchPreview = useCallback(async () => {
    if (!report) return

    const isAccounting = report.layout === "accounting"

    setPreviewLoading(true)
    try {
      const response = await fetch(`/api/reports/${id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          // Accounting layout: no period filtering — all rows used
          currentPeriodKey: isAccounting ? undefined : (currentPeriodKey || undefined),
          compareMode: isAccounting ? "none" : effectiveCompareMode,
          // Send current local state so preview works without saving
          liveConfig: {
            columns: reportColumns,
            formulaRows: reportFormulaRows,
            pivotColumnKey,
            metricRows,
            pivotFormulaColumns,
          },
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setPreviewData(data)

        // Auto-select first period if none selected (not for accounting layout)
        if (!isAccounting && !currentPeriodKey && data.availablePeriods?.length > 0) {
          setCurrentPeriodKey(data.availablePeriods[0].key)
        }
      }
    } catch (err) {
      console.error("Error fetching preview:", err)
    } finally {
      setPreviewLoading(false)
    }
  }, [id, report, currentPeriodKey, effectiveCompareMode, reportColumns, reportFormulaRows, pivotColumnKey, metricRows, pivotFormulaColumns])

  // Fetch preview when report loads or period/mode changes
  useEffect(() => {
    if (report) {
      fetchPreview()
    }
  }, [report, currentPeriodKey, effectiveCompareMode, fetchPreview])

  // Save changes
  const handleSave = useCallback(async () => {
    if (!report) return
    
    setSaving(true)
    setSaveStatus("saving")
    setError(null)

    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          // Standard layout fields
          columns: reportColumns,
          formulaRows: reportFormulaRows,
          // Pivot layout fields
          pivotColumnKey,
          metricRows,
          pivotFormulaColumns,
          // Variance settings - use effectiveCompareMode to ensure comparison rows work
          compareMode: effectiveCompareMode,
          // Filter configuration
          filterColumnKeys,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save")
      }

      setSaveStatus("saved")
      // Reset to idle after showing "Saved" briefly
      setTimeout(() => setSaveStatus("idle"), 1500)
    } catch (err: any) {
      setError(err.message)
      setSaveStatus("idle")
    } finally {
      setSaving(false)
    }
  }, [id, report, reportColumns, reportFormulaRows, pivotColumnKey, metricRows, pivotFormulaColumns, effectiveCompareMode, filterColumnKeys])

  // Auto-save effect: debounce 1 second after changes
  useEffect(() => {
    // Skip auto-save on initial load
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      return
    }
    
    // Don't auto-save if report not loaded yet
    if (!report) return

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new debounced save
    saveTimeoutRef.current = setTimeout(() => {
      handleSave()
    }, 1000)

    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [reportColumns, reportFormulaRows, pivotColumnKey, metricRows, pivotFormulaColumns, effectiveCompareMode, filterColumnKeys, handleSave, report])

  // Toggle source column
  const toggleSourceColumn = (dbColumn: { key: string; label: string; dataType: string }) => {
    const existingIndex = reportColumns.findIndex(
      c => c.type === "source" && c.sourceColumnKey === dbColumn.key
    )

    if (existingIndex >= 0) {
      // Remove column
      setReportColumns(prev => prev.filter((_, i) => i !== existingIndex))
    } else {
      // Add column
      const newColumn: ReportColumn = {
        key: `src_${dbColumn.key}`,
        label: dbColumn.label,
        type: "source",
        sourceColumnKey: dbColumn.key,
        dataType: dbColumn.dataType as any,
        order: reportColumns.length,
      }
      setReportColumns(prev => [...prev, newColumn])
    }
    setHasUnsavedChanges(true)
  }

  // Check if source column is selected
  const isSourceColumnSelected = (dbColumnKey: string) => {
    return reportColumns.some(c => c.type === "source" && c.sourceColumnKey === dbColumnKey)
  }

  // Database schema columns
  const databaseColumns = report?.database.schema.columns || []

  // Formula columns (for display)
  const formulaColumns = reportColumns.filter(c => c.type === "formula")

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Report not found</p>
          <Link href="/dashboard/reports" className="mt-4 inline-block">
            <Button variant="outline">Back to Reports</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/reports">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-gray-900">{report.name}</h1>
                  <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                    {CADENCE_LABELS[report.cadence] || report.cadence}
                  </span>
                </div>
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  {report.database.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === "saving" && (
                <span className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="text-xs text-green-600 flex items-center gap-1.5">
                  <Save className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Main content - split pane */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel - Configuration */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Data Source Info */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                {report.layout === "accounting" || report.layout === "pivot" ? (
                  <LayoutGrid className="w-4 h-4 text-blue-500" />
                ) : (
                  <Database className="w-4 h-4 text-gray-500" />
                )}
                <span className="font-medium text-gray-700">{report.database.name}</span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                  {report.layout === "accounting" ? "Accounting" : report.layout === "pivot" ? "Matrix" : "Standard"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {report.database.rowCount.toLocaleString()} rows available
                {report.layout === "pivot" && report.pivotColumnKey && (
                  <> • Pivot: {databaseColumns.find(c => c.key === report.pivotColumnKey)?.label || report.pivotColumnKey}</>
                )}
              </p>
            </div>

            {/* === ACCOUNTING LAYOUT CONFIG === */}
            {report.layout === "accounting" && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2.5 bg-gray-50">
                  <span className="font-medium text-sm text-gray-700">Accounting Configuration</span>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Row Column</span>
                    <span className="text-gray-700 font-medium">
                      {databaseColumns.find(c => c.key === report.rowColumnKey)?.label || report.rowColumnKey || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Period Column</span>
                    <span className="text-gray-700 font-medium">
                      {databaseColumns.find(c => c.key === report.pivotColumnKey)?.label || report.pivotColumnKey || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Value Column</span>
                    <span className="text-gray-700 font-medium">
                      {databaseColumns.find(c => c.key === report.valueColumnKey)?.label || report.valueColumnKey || "—"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
                    Variance column is auto-generated (last period - first period)
                  </p>
                </div>
              </div>
            )}

            {/* === FILTERS CONFIGURATION === */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2.5 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-sm text-gray-700">Filters</span>
                  {filterColumnKeys.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                      {filterColumnKeys.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setFilterConfigOpen(!filterConfigOpen)}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="Configure filterable columns"
                >
                  <Settings2 className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
              
              {/* Filter Configuration Panel */}
              {filterConfigOpen && (
                <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                  <p className="text-xs text-blue-700 font-medium mb-2">
                    Select columns to expose as filters:
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {databaseColumns
                      .filter(col => col.key !== report.dateColumnKey) // Exclude date column
                      .map((col) => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 px-2 py-1 hover:bg-blue-100 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={filterColumnKeys.includes(col.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilterColumnKeys([...filterColumnKeys, col.key])
                              } else {
                                setFilterColumnKeys(filterColumnKeys.filter(k => k !== col.key))
                              }
                              setHasUnsavedChanges(true)
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-700">{col.label}</span>
                          <span className="text-xs text-gray-400">({col.dataType})</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
              
              {/* Display configured filter columns */}
              <div className="p-3">
                {filterColumnKeys.length > 0 ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">
                      Columns available as filters:
                    </p>
                    <p className="text-sm text-gray-700">
                      {filterColumnKeys
                        .map(key => databaseColumns.find(c => c.key === key)?.label || key)
                        .join(", ")}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    No filter columns configured. Click the gear icon to select columns.
                  </p>
                )}
              </div>
            </div>

            {/* === PIVOT LAYOUT UI - Simple Row List === */}
            {report.layout === "pivot" && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2.5 bg-gray-50 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm text-gray-700">Metric Rows</span>
                    <p className="text-xs text-gray-400 mt-0.5">Click to edit, drag to reorder</p>
                  </div>
                  <span className="text-xs text-gray-500">{metricRows.length} rows</span>
                </div>

                {/* Draggable row list */}
                <div className="p-2 space-y-1">
                  {metricRows.length === 0 ? (
                    <p className="px-2 py-4 text-center text-gray-400 text-xs">
                      No rows yet. Click "Add Row" to start.
                    </p>
                  ) : (
                    [...metricRows].sort((a, b) => a.order - b.order).map((metric, index) => (
                      <div
                        key={metric.key}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", metric.key)
                          e.currentTarget.classList.add("opacity-50")
                        }}
                        onDragEnd={(e) => {
                          e.currentTarget.classList.remove("opacity-50")
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.add("bg-blue-50", "border-blue-300")
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove("bg-blue-50", "border-blue-300")
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.remove("bg-blue-50", "border-blue-300")
                          const draggedKey = e.dataTransfer.getData("text/plain")
                          if (draggedKey === metric.key) return
                          
                          // Reorder: move dragged item to this position
                          const sorted = [...metricRows].sort((a, b) => a.order - b.order)
                          const draggedIndex = sorted.findIndex(m => m.key === draggedKey)
                          const targetIndex = sorted.findIndex(m => m.key === metric.key)
                          
                          if (draggedIndex === -1 || targetIndex === -1) return
                          
                          // Remove dragged item and insert at target position
                          const [draggedItem] = sorted.splice(draggedIndex, 1)
                          sorted.splice(targetIndex, 0, draggedItem)
                          
                          // Update order values
                          const reordered = sorted.map((m, i) => ({ ...m, order: i }))
                          setMetricRows(reordered)
                          setHasUnsavedChanges(true)
                        }}
                        className="flex items-center gap-1 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors group border border-transparent cursor-grab active:cursor-grabbing"
                      >
                        {/* Drag handle */}
                        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                        
                        {/* Clickable content */}
                        <button
                          onClick={() => setMetricRowModal({ open: true, editingKey: metric.key })}
                          className="flex-1 flex items-center gap-2 text-left min-w-0"
                        >
                          {/* Type icon */}
                          {metric.type === "source" && <Database className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                          {metric.type === "formula" && <FunctionSquare className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                          {metric.type === "comparison" && <TrendingUp className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                          
                          {/* Label */}
                          <span className="flex-1 text-sm text-gray-700 truncate">
                            {metric.label || <span className="text-gray-400 italic">Untitled</span>}
                          </span>
                          
                          {/* Type badge */}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            metric.type === "source" ? "bg-blue-100 text-blue-700" :
                            metric.type === "formula" ? "bg-purple-100 text-purple-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {metric.type === "source" ? "Source" : metric.type === "formula" ? "Formula" : "Compare"}
                          </span>
                        </button>
                        
                        {/* Delete button (appears on hover) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMetricRows(prev => prev.filter(m => m.key !== metric.key))
                            setHasUnsavedChanges(true)
                          }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-opacity flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Row Button */}
                <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setMetricRowModal({ open: true, editingKey: null })}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Row
                  </Button>
                </div>
              </div>
            )}

            {/* === PIVOT COLUMNS SECTION === */}
            {report.layout === "pivot" && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2.5 bg-gray-50 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm text-gray-700">Pivot Columns</span>
                    <p className="text-xs text-gray-400 mt-0.5">Auto-generated + formula columns</p>
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  {/* Auto-generated columns from pivot */}
                  {previewData?.table?.columns && previewData.table.columns.filter(c => c.key !== "_label" && c.type === "source").length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        From Data
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {previewData.table.columns
                          .filter(c => c.key !== "_label" && c.type === "source")
                          .map(col => (
                            <span
                              key={col.key}
                              className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs"
                            >
                              {col.label}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Formula columns */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Formula Columns
                    </p>
                    {pivotFormulaColumns.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No formula columns yet</p>
                    ) : (
                      <div className="space-y-1">
                        {[...pivotFormulaColumns].sort((a, b) => a.order - b.order).map(fc => (
                          <button
                            key={fc.key}
                            onClick={() => setPivotFormulaColumnModal({ open: true, editingKey: fc.key })}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-gray-100 text-left group"
                          >
                            <FunctionSquare className="w-4 h-4 text-purple-500 flex-shrink-0" />
                            <span className="flex-1 text-sm text-gray-700 truncate">{fc.label}</span>
                            <span className="text-xs text-gray-400 font-mono truncate max-w-24">{fc.expression}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setPivotFormulaColumns(prev => prev.filter(c => c.key !== fc.key))
                                setHasUnsavedChanges(true)
                              }}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-opacity flex-shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Formula Column Button */}
                <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setPivotFormulaColumnModal({ open: true, editingKey: null })}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Formula Column
                  </Button>
                </div>
              </div>
            )}

            {/* === STANDARD LAYOUT UI === */}
            {report.layout !== "pivot" && (
              <>
            {/* Columns Section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setColumnsExpanded(!columnsExpanded)}
                className="w-full px-3 py-2.5 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="font-medium text-sm text-gray-700">Columns</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {reportColumns.length} selected
                  </span>
                  {columnsExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </button>

              {columnsExpanded && (
                <div className="p-3 space-y-3">
                  {/* Source columns (from database) */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Data Columns
                    </p>
                    <div className="space-y-1.5">
                      {databaseColumns.map((col) => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded -mx-1.5"
                        >
                          <Checkbox
                            checked={isSourceColumnSelected(col.key)}
                            onCheckedChange={() => toggleSourceColumn(col)}
                          />
                          <span className="text-sm text-gray-700 flex-1">{col.label}</span>
                          <span className="text-xs text-gray-400">{col.dataType}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Formula columns */}
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Formula Columns
                    </p>
                    {formulaColumns.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No formula columns yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {formulaColumns.map((col) => (
                          <div
                            key={col.key}
                            className="flex items-center gap-2 p-1.5 rounded bg-purple-50 -mx-1.5"
                          >
                            <FunctionSquare className="w-4 h-4 text-purple-500" />
                            <span className="text-sm text-gray-700 flex-1">{col.label}</span>
                            <button
                              onClick={() => setFormulaColumnPanel({ open: true, editingKey: col.key })}
                              className="p-1 hover:bg-purple-100 rounded"
                            >
                              <Settings2 className="w-3.5 h-3.5 text-purple-600" />
                            </button>
                            <button
                              onClick={() => {
                                setReportColumns(prev => prev.filter(c => c.key !== col.key))
                                setHasUnsavedChanges(true)
                              }}
                              className="p-1 hover:bg-red-100 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => setFormulaColumnPanel({ open: true, editingKey: null })}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add Formula Column
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Formula Rows Section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setFormulaRowsExpanded(!formulaRowsExpanded)}
                className="w-full px-3 py-2.5 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="font-medium text-sm text-gray-700">Formula Rows</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {reportFormulaRows.length} rows
                  </span>
                  {formulaRowsExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </button>

              {formulaRowsExpanded && (
                <div className="p-3">
                  {reportFormulaRows.length === 0 ? (
                    <p className="text-xs text-gray-400 italic mb-2">
                      No formula rows yet (e.g., Total, Average)
                    </p>
                  ) : (
                    <div className="space-y-1.5 mb-2">
                      {reportFormulaRows.map((row) => (
                        <div
                          key={row.key}
                          className="flex items-center gap-2 p-1.5 rounded bg-green-50 -mx-1.5"
                        >
                          <FunctionSquare className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-gray-700 flex-1">{row.label}</span>
                          <button
                            onClick={() => setFormulaRowModal({ open: true, editingKey: row.key })}
                            className="p-1 hover:bg-green-100 rounded"
                          >
                            <Settings2 className="w-3.5 h-3.5 text-green-600" />
                          </button>
                          <button
                            onClick={() => {
                              setReportFormulaRows(prev => prev.filter(r => r.key !== row.key))
                              setHasUnsavedChanges(true)
                            }}
                            className="p-1 hover:bg-red-100 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setFormulaRowModal({ open: true, editingKey: null })}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Formula Row
                  </Button>
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </div>

        {/* Right panel - Preview */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {/* Preview header with period controls */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Preview</span>
                {previewLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPreview}
                disabled={previewLoading}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${previewLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            
            {/* Period and Compare Mode Controls - hidden for accounting layout */}
            {report.layout !== "accounting" && (
              <>
                <div className="flex items-center gap-4">
                  {/* Period Picker */}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <Select
                      value={currentPeriodKey}
                      onValueChange={(v) => {
                        setCurrentPeriodKey(v)
                        setHasUnsavedChanges(true)
                      }}
                    >
                      <SelectTrigger className="w-[180px] h-8 text-sm">
                        <SelectValue placeholder="Select period..." />
                      </SelectTrigger>
                      <SelectContent>
                        {previewData?.availablePeriods && previewData.availablePeriods.length > 0 ? (
                          previewData.availablePeriods.map((period) => (
                            <SelectItem key={period.key} value={period.key}>
                              {period.label}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-gray-500">No periods available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Compare Mode Selector - only for standard layout */}
                  {report.layout !== "pivot" && (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-gray-400" />
                      <Select
                        value={compareMode}
                        onValueChange={(v: "none" | "mom" | "yoy") => {
                          setCompareMode(v)
                          setHasUnsavedChanges(true)
                        }}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Comparison</SelectItem>
                          <SelectItem value="mom">vs Previous (MoM)</SelectItem>
                          <SelectItem value="yoy">vs Last Year (YoY)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Info for pivot layout with comparison rows */}
                  {report.layout === "pivot" && metricRows.some(m => m.type === "comparison") && (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Comparison data auto-loaded for comparison rows
                    </div>
                  )}
                </div>

                {/* Period Info Display */}
                {previewData && (previewData.current || previewData.compare) && (
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    {previewData.current && (
                      <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 rounded text-blue-700">
                        <span className="font-medium">Current:</span>
                        <span>{previewData.current.label}</span>
                        <span className="text-blue-500">({previewData.current.rowCount} rows)</span>
                      </div>
                    )}
                    {previewData.compare && (
                      <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 rounded text-amber-700">
                        <span className="font-medium">Compare:</span>
                        <span>{previewData.compare.label}</span>
                        <span className="text-amber-500">({previewData.compare.rowCount} rows)</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Accounting layout info */}
            {report.layout === "accounting" && previewData && (
              <div className="text-xs text-gray-500">
                All periods shown as columns with auto-generated variance
                {previewData.diagnostics && (
                  <span> • {previewData.diagnostics.totalDatabaseRows.toLocaleString()} total rows</span>
                )}
              </div>
            )}

            {/* Parse Failures Warning */}
            {previewData && previewData.diagnostics.parseFailures > 0 && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  {previewData.diagnostics.parseFailures} row{previewData.diagnostics.parseFailures !== 1 ? "s" : ""} skipped due to unrecognized period format.
                  Expected formats: <strong>Jan-26</strong>, <strong>January 2026</strong>, or <strong>2026-01</strong>
                </span>
              </div>
            )}
          </div>

          {/* Preview content */}
          <div className="flex-1 overflow-auto p-4">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">Loading preview...</p>
                </div>
              </div>
            ) : !previewData || previewData.table.columns.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  {report.layout === "accounting" ? (
                    <>
                      <p className="font-medium">No preview available</p>
                      <p className="text-sm mt-1">
                        No data found in the database. Sync data first to see the accounting report.
                      </p>
                    </>
                  ) : report.layout === "pivot" ? (
                    <>
                      <p className="font-medium">No preview available</p>
                      <p className="text-sm mt-1">
                        {metricRows.length === 0
                          ? "Add metric rows to preview your report"
                          : !currentPeriodKey
                            ? "Select a period to preview data"
                            : "No data found for the selected period"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">No columns selected</p>
                      <p className="text-sm mt-1">Select columns from the left panel to preview your report</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto h-full">
                <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                  <thead className="bg-gray-100 border-b border-gray-300 sticky top-0 z-20">
                    <tr>
                      {previewData.table.columns.map((col, colIndex) => {
                        const isLabelColumn = col.key === "_label"
                        return (
                          <th
                            key={col.key}
                            className={`px-4 py-3 text-sm font-semibold text-gray-600 ${
                              isLabelColumn 
                                ? "text-left sticky left-0 z-30 bg-gray-100 whitespace-nowrap" 
                                : "text-center border-l border-gray-200"
                            }`}
                            style={{ 
                              width: isLabelColumn ? 200 : 120, 
                              minWidth: isLabelColumn ? 200 : 120,
                              maxWidth: isLabelColumn ? 200 : 120
                            }}
                          >
                            <div className={`flex items-center gap-1.5 ${isLabelColumn ? "" : "justify-center"}`}>
                              {col.type === "formula" && (
                                <FunctionSquare className="w-3.5 h-3.5 text-purple-500" />
                              )}
                              {col.label}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {previewData.table.rows.map((row, rowIndex) => {
                      const rowType = row._type as string | undefined
                      return (
                        <tr key={`row-${row._label || rowIndex}`} className="hover:bg-blue-50 transition-colors bg-white">
                          {previewData.table.columns.map((col, colIndex) => {
                            // For pivot layouts, use row's _format if available (except for label column)
                            const effectiveFormat = col.key === "_label" 
                              ? "text" 
                              : ((row._format as string) || col.dataType)
                            const isLabelColumn = col.key === "_label"
                            return (
                              <td 
                                key={col.key} 
                                className={`px-4 py-3 text-sm border-b border-gray-200 overflow-hidden text-ellipsis whitespace-nowrap ${
                                  isLabelColumn 
                                    ? "sticky left-0 z-10 bg-white font-medium text-gray-900" 
                                    : "text-center border-l border-gray-200 text-gray-700"
                                }`}
                                style={{ 
                                  width: isLabelColumn ? 200 : 120, 
                                  minWidth: isLabelColumn ? 200 : 120,
                                  maxWidth: isLabelColumn ? 200 : 120
                                }}
                              >
                                {isLabelColumn ? (
                                  <span className="flex items-center gap-1.5">
                                    {rowType === "formula" && <FunctionSquare className="w-3.5 h-3.5 text-purple-500" />}
                                    {rowType === "comparison" && <TrendingUp className="w-3.5 h-3.5 text-amber-500" />}
                                    {formatCellValue(row[col.key], effectiveFormat)}
                                  </span>
                                ) : (
                                  formatCellValue(row[col.key], effectiveFormat)
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {/* Formula rows */}
                    {previewData.table.formulaRows.map((fr, frIndex) => (
                      <tr key={fr.key} className="bg-blue-50 hover:bg-blue-100 transition-colors">
                        {previewData.table.columns.map((col, colIndex) => {
                          const isLabelColumn = colIndex === 0
                          return (
                            <td 
                              key={col.key} 
                              className={`px-4 py-3 text-sm border-b border-blue-200 overflow-hidden text-ellipsis whitespace-nowrap ${
                                isLabelColumn 
                                  ? "sticky left-0 z-10 bg-blue-50 font-medium text-gray-900" 
                                  : "text-center border-l border-blue-200 text-gray-700"
                              }`}
                              style={{ 
                                width: isLabelColumn ? 200 : 120, 
                                minWidth: isLabelColumn ? 200 : 120,
                                maxWidth: isLabelColumn ? 200 : 120
                              }}
                            >
                              {isLabelColumn ? (
                                <span className="flex items-center gap-1.5">
                                  <FunctionSquare className="w-3.5 h-3.5 text-purple-500" />
                                  {fr.label}
                                </span>
                              ) : (
                                formatCellValue(fr.values[col.key], col.dataType)
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Formula Column Slide-out Panel */}
      <FormulaColumnPanel
        open={formulaColumnPanel.open}
        editingKey={formulaColumnPanel.editingKey}
        columns={reportColumns}
        databaseColumns={databaseColumns}
        onClose={() => setFormulaColumnPanel({ open: false, editingKey: null })}
        onSave={(column) => {
          if (formulaColumnPanel.editingKey) {
            // Update existing
            setReportColumns(prev =>
              prev.map(c => c.key === formulaColumnPanel.editingKey ? column : c)
            )
          } else {
            // Add new
            setReportColumns(prev => [...prev, { ...column, order: prev.length }])
          }
          setHasUnsavedChanges(true)
          setFormulaColumnPanel({ open: false, editingKey: null })
        }}
      />

      {/* Formula Row Modal */}
      <FormulaRowModal
        open={formulaRowModal.open}
        editingKey={formulaRowModal.editingKey}
        formulaRows={reportFormulaRows}
        reportColumns={reportColumns}
        onClose={() => setFormulaRowModal({ open: false, editingKey: null })}
        onSave={(row) => {
          if (formulaRowModal.editingKey) {
            // Update existing
            setReportFormulaRows(prev =>
              prev.map(r => r.key === formulaRowModal.editingKey ? row : r)
            )
          } else {
            // Add new
            setReportFormulaRows(prev => [...prev, { ...row, order: prev.length }])
          }
          setHasUnsavedChanges(true)
          setFormulaRowModal({ open: false, editingKey: null })
        }}
      />

      {/* Metric Row Modal (for Pivot Layout) */}
      <MetricRowModal
        open={metricRowModal.open}
        editingKey={metricRowModal.editingKey}
        metricRows={metricRows}
        databaseColumns={databaseColumns}
        onClose={() => setMetricRowModal({ open: false, editingKey: null })}
        onSave={(metric) => {
          if (metricRowModal.editingKey) {
            // Update existing
            setMetricRows(prev =>
              prev.map(m => m.key === metricRowModal.editingKey ? metric : m)
            )
          } else {
            // Add new
            setMetricRows(prev => [...prev, { ...metric, order: prev.length }])
          }
          setHasUnsavedChanges(true)
          setMetricRowModal({ open: false, editingKey: null })
        }}
        onDelete={(key) => {
          setMetricRows(prev => prev.filter(m => m.key !== key))
          setHasUnsavedChanges(true)
          setMetricRowModal({ open: false, editingKey: null })
        }}
        onAddSourceRow={(column) => {
          // Auto-create a source metric row for this database column
          const formatMap: Record<string, "text" | "number" | "currency" | "percent"> = {
            text: "text",
            number: "number",
            currency: "currency",
            date: "text",
            boolean: "text",
          }
          const newMetric: MetricRow = {
            key: `src_${column.key}_${Date.now()}`,
            label: column.label,
            type: "source",
            sourceColumnKey: column.key,
            format: formatMap[column.dataType] || "number",
            order: metricRows.length,
          }
          setMetricRows(prev => [...prev, newMetric])
          setHasUnsavedChanges(true)
          return newMetric.key
        }}
      />

      {/* Pivot Formula Column Modal */}
      <PivotFormulaColumnModal
        open={pivotFormulaColumnModal.open}
        editingKey={pivotFormulaColumnModal.editingKey}
        pivotFormulaColumns={pivotFormulaColumns}
        pivotValues={
          // Get auto-generated pivot column labels from preview data (exclude _label and formula columns)
          previewData?.table?.columns
            ?.filter(c => c.key !== "_label" && c.type === "source")
            ?.map(c => c.label) || []
        }
        onClose={() => setPivotFormulaColumnModal({ open: false, editingKey: null })}
        onSave={(column) => {
          if (pivotFormulaColumnModal.editingKey) {
            setPivotFormulaColumns(prev =>
              prev.map(c => c.key === pivotFormulaColumnModal.editingKey ? column : c)
            )
          } else {
            setPivotFormulaColumns(prev => [...prev, { ...column, order: prev.length }])
          }
          setHasUnsavedChanges(true)
          setPivotFormulaColumnModal({ open: false, editingKey: null })
        }}
        onDelete={(key) => {
          setPivotFormulaColumns(prev => prev.filter(c => c.key !== key))
          setHasUnsavedChanges(true)
          setPivotFormulaColumnModal({ open: false, editingKey: null })
        }}
      />
    </div>
  )
}

// Helper to format cell values
function formatCellValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined) return "—"
  
  // Coerce string numbers to actual numbers for formatting
  let numValue: number | null = null
  if (typeof value === "number") {
    numValue = value
  } else if (typeof value === "string" && !isNaN(Number(value)) && value.trim() !== "") {
    numValue = Number(value)
  }
  
  // Normalize dataType to lowercase for comparison
  const format = (dataType || "").toLowerCase()
  
  if (format === "currency" && numValue !== null) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numValue)
  }
  if (format === "percent" && numValue !== null) {
    return `${numValue.toLocaleString()}%`
  }
  if ((format === "number" || !format) && numValue !== null) {
    return numValue.toLocaleString()
  }
  return String(value)
}

// Formula Column Slide-out Panel Component
interface FormulaColumnPanelProps {
  open: boolean
  editingKey: string | null
  columns: ReportColumn[]
  databaseColumns: Array<{ key: string; label: string; dataType: string }>
  onClose: () => void
  onSave: (column: ReportColumn) => void
}

function FormulaColumnPanel({
  open,
  editingKey,
  columns,
  databaseColumns,
  onClose,
  onSave,
}: FormulaColumnPanelProps) {
  const editingColumn = editingKey ? columns.find(c => c.key === editingKey) : null
  const inputRef = useRef<HTMLInputElement>(null)

  const [label, setLabel] = useState("")
  const [expression, setExpression] = useState("")
  const [dataType, setDataType] = useState<"number" | "currency" | "text">("number")

  // Build key-to-label and label-to-key mappings for database columns
  const keyToLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    databaseColumns.forEach(col => {
      map[col.key] = col.label
    })
    return map
  }, [databaseColumns])

  const labelToKeyMap = useMemo(() => {
    const map: Record<string, string> = {}
    databaseColumns.forEach(col => {
      map[col.label] = col.key
    })
    return map
  }, [databaseColumns])

  // Convert internal expression (keys) to display expression (labels)
  const keysToLabels = useCallback((expr: string): string => {
    if (!expr) return ""
    let result = expr
    // Sort by key length descending to avoid partial replacements
    const sortedKeys = Object.keys(keyToLabelMap).sort((a, b) => b.length - a.length)
    sortedKeys.forEach(key => {
      const label = keyToLabelMap[key]
      if (label) {
        result = result.replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), `[${label}]`)
      }
    })
    return result
  }, [keyToLabelMap])

  // Convert display expression (labels) to internal expression (keys)
  const labelsToKeys = useCallback((expr: string): string => {
    if (!expr) return ""
    let result = expr
    // Replace [Label Name] with the corresponding key
    Object.entries(labelToKeyMap).forEach(([label, key]) => {
      result = result.replace(new RegExp(`\\[${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g'), key)
    })
    return result
  }, [labelToKeyMap])

  // Reset form when panel opens
  useEffect(() => {
    if (open) {
      if (editingColumn) {
        setLabel(editingColumn.label)
        // Convert stored keys to display labels
        setExpression(keysToLabels(editingColumn.expression || ""))
        setDataType(editingColumn.dataType as any)
      } else {
        setLabel("")
        setExpression("")
        setDataType("number")
      }
    }
  }, [open, editingColumn, keysToLabels])

  const handleSave = () => {
    if (!label.trim() || !expression.trim()) return

    const key = editingKey || `formula_${Date.now()}`
    // Convert display expression (with labels) to internal expression (with keys)
    const internalExpression = labelsToKeys(expression.trim())
    
    onSave({
      key,
      label: label.trim(),
      type: "formula",
      expression: internalExpression,
      dataType,
      order: editingColumn?.order || 0,
    })
  }

  // Insert column label at cursor position (in bracket format)
  const insertColumn = (colLabel: string) => {
    const insertText = `[${colLabel}]`
    const input = inputRef.current
    if (input) {
      const start = input.selectionStart || expression.length
      const end = input.selectionEnd || expression.length
      const newExpression = expression.slice(0, start) + insertText + expression.slice(end)
      setExpression(newExpression)
      // Focus and move cursor after inserted text
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + insertText.length, start + insertText.length)
      }, 0)
    } else {
      setExpression(expression + insertText)
    }
  }

  // Get data type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case "number":
      case "currency":
        return "bg-blue-100 text-blue-700 hover:bg-blue-200"
      case "text":
        return "bg-green-100 text-green-700 hover:bg-green-200"
      case "date":
        return "bg-purple-100 text-purple-700 hover:bg-purple-200"
      default:
        return "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      
      {/* Slide-out panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingKey ? "Edit Formula Column" : "Add Formula Column"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Column Label */}
          <div className="space-y-2">
            <Label>Column Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Margin %"
            />
          </div>

          {/* Available Columns - Pills */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Available Columns
              <span className="text-xs font-normal text-gray-400">Click to insert</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {databaseColumns.map((col) => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => insertColumn(col.label)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${getTypeColor(col.dataType)}`}
                  title={col.dataType}
                >
                  {col.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Click a column to add it to your formula
            </p>
          </div>

          {/* Operators - Quick insert */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Operators
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {["+", "-", "*", "/", "(", ")", "100"].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => insertColumn(op === "100" ? " * 100" : ` ${op} `)}
                  className="px-3 py-1 text-xs font-mono font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  {op}
                </button>
              ))}
            </div>
          </div>

          {/* Formula Expression */}
          <div className="space-y-2">
            <Label>Formula Expression</Label>
            <Input
              ref={inputRef}
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="e.g., ([Revenue] - [Costs]) / [Revenue] * 100"
              className="text-sm"
            />
            <p className="text-xs text-gray-400">
              Click columns above or type [Column Name] to reference columns
            </p>
          </div>

          {/* Result Type */}
          <div className="space-y-2">
            <Label>Result Type</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!label.trim() || !expression.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {editingKey ? "Update" : "Add"} Column
          </Button>
        </div>
      </div>
    </>
  )
}

// Formula Row Modal Component
interface FormulaRowModalProps {
  open: boolean
  editingKey: string | null
  formulaRows: ReportFormulaRow[]
  reportColumns: ReportColumn[]
  onClose: () => void
  onSave: (row: ReportFormulaRow) => void
}

function FormulaRowModal({
  open,
  editingKey,
  formulaRows,
  reportColumns,
  onClose,
  onSave,
}: FormulaRowModalProps) {
  const editingRow = editingKey ? formulaRows.find(r => r.key === editingKey) : null

  const [label, setLabel] = useState("")
  const [columnFormulas, setColumnFormulas] = useState<Record<string, string>>({})

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (editingRow) {
        setLabel(editingRow.label)
        setColumnFormulas(editingRow.columnFormulas)
      } else {
        setLabel("")
        // Default to SUM for numeric columns
        const defaults: Record<string, string> = {}
        reportColumns.forEach(col => {
          if (col.dataType === "number" || col.dataType === "currency") {
            defaults[col.key] = "SUM"
          }
        })
        setColumnFormulas(defaults)
      }
    }
  }, [open, editingRow, reportColumns])

  const handleSave = () => {
    if (!label.trim()) return

    const key = editingKey || `row_${Date.now()}`
    onSave({
      key,
      label: label.trim(),
      columnFormulas,
      order: editingRow?.order || 0,
    })
  }

  // Only show numeric columns for aggregation
  const numericColumns = reportColumns.filter(
    c => c.dataType === "number" || c.dataType === "currency"
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingKey ? "Edit Formula Row" : "Add Formula Row"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Row Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Total, Average"
            />
          </div>

          <div className="space-y-2">
            <Label>Column Aggregations</Label>
            {numericColumns.length === 0 ? (
              <p className="text-sm text-gray-500">
                No numeric columns selected. Add number or currency columns first.
              </p>
            ) : (
              <div className="space-y-2">
                {numericColumns.map((col) => (
                  <div key={col.key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-32 truncate">{col.label}</span>
                    <Select
                      value={columnFormulas[col.key] || ""}
                      onValueChange={(v) =>
                        setColumnFormulas(prev => ({ ...prev, [col.key]: v }))
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SUM">SUM</SelectItem>
                        <SelectItem value="AVG">AVERAGE</SelectItem>
                        <SelectItem value="COUNT">COUNT</SelectItem>
                        <SelectItem value="MIN">MIN</SelectItem>
                        <SelectItem value="MAX">MAX</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!label.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {editingKey ? "Update" : "Add"} Row
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// Metric Row Modal Component (for Pivot Layout)
// ============================================
interface MetricRowModalProps {
  open: boolean
  editingKey: string | null
  metricRows: MetricRow[]
  databaseColumns: Array<{ key: string; label: string; dataType: string }>
  onClose: () => void
  onSave: (metric: MetricRow) => void
  onDelete: (key: string) => void
  onAddSourceRow: (column: { key: string; label: string; dataType: string }) => string // Returns the new metric key
}

function MetricRowModal({
  open,
  editingKey,
  metricRows,
  databaseColumns,
  onClose,
  onSave,
  onDelete,
  onAddSourceRow,
}: MetricRowModalProps) {
  const [label, setLabel] = useState("")
  const [type, setType] = useState<"source" | "formula" | "comparison">("source")
  const [sourceColumnKey, setSourceColumnKey] = useState("")
  const [expression, setExpression] = useState("")
  const [compareRowKey, setCompareRowKey] = useState("")
  const [comparePeriod, setComparePeriod] = useState<"mom" | "qoq" | "yoy">("yoy")
  const [compareOutput, setCompareOutput] = useState<"value" | "delta" | "percent">("value")
  const [format, setFormat] = useState<"text" | "number" | "currency" | "percent">("currency")

  const editingMetric = editingKey
    ? metricRows.find(m => m.key === editingKey)
    : null

  // Helper to build key-to-label mapping for other metrics
  const keyToLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    metricRows.forEach(m => {
      if (m.key !== editingKey && m.label) {
        map[m.key] = m.label
      }
    })
    return map
  }, [metricRows, editingKey])

  const labelToKeyMap = useMemo(() => {
    const map: Record<string, string> = {}
    metricRows.forEach(m => {
      if (m.key !== editingKey && m.label) {
        map[m.label] = m.key
      }
    })
    return map
  }, [metricRows, editingKey])

  // Convert internal expression (keys) to display expression (labels)
  const keysToLabels = useCallback((expr: string): string => {
    if (!expr) return ""
    let result = expr
    // Sort by key length descending to avoid partial replacements
    const sortedKeys = Object.keys(keyToLabelMap).sort((a, b) => b.length - a.length)
    sortedKeys.forEach(key => {
      const label = keyToLabelMap[key]
      if (label) {
        result = result.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `[${label}]`)
      }
    })
    return result
  }, [keyToLabelMap])

  // Convert display expression (labels) to internal expression (keys)
  const labelsToKeys = useCallback((expr: string): string => {
    if (!expr) return ""
    let result = expr
    // Replace [Label Name] with the corresponding key
    Object.entries(labelToKeyMap).forEach(([label, key]) => {
      result = result.replace(new RegExp(`\\[${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g'), key)
    })
    return result
  }, [labelToKeyMap])

  // Initialize form when editing
  useEffect(() => {
    if (open && editingMetric) {
      setLabel(editingMetric.label)
      setType(editingMetric.type)
      setSourceColumnKey(editingMetric.sourceColumnKey || "")
      // Convert stored keys to display labels
      setExpression(keysToLabels(editingMetric.expression || ""))
      setCompareRowKey(editingMetric.compareRowKey || "")
      setComparePeriod(editingMetric.comparePeriod || "yoy")
      setCompareOutput(editingMetric.compareOutput || "value")
      setFormat(editingMetric.format)
    } else if (open && !editingKey) {
      // Reset for new row
      setLabel("")
      setType("source")
      setSourceColumnKey("")
      setExpression("")
      setCompareRowKey("")
      setComparePeriod("yoy")
      setCompareOutput("value")
      setFormat("currency")
    }
  }, [open, editingKey, editingMetric, keysToLabels])

  const handleSave = () => {
    if (!label.trim()) return
    if (type === "source" && !sourceColumnKey) return
    if (type === "formula" && !expression.trim()) return
    if (type === "comparison" && !compareRowKey) return

    const key = editingKey || `metric_${Date.now()}`
    // Convert display expression (with labels) to internal expression (with keys)
    const internalExpression = type === "formula" ? labelsToKeys(expression.trim()) : undefined
    
    onSave({
      key,
      label: label.trim(),
      type,
      sourceColumnKey: type === "source" ? sourceColumnKey : undefined,
      expression: internalExpression,
      compareRowKey: type === "comparison" ? compareRowKey : undefined,
      comparePeriod: type === "comparison" ? comparePeriod : undefined,
      compareOutput: type === "comparison" ? compareOutput : undefined,
      format,
      order: editingMetric?.order || 0,
    })
  }

  // Get other metrics for formula/comparison references
  const otherMetrics = metricRows.filter(m => m.key !== editingKey)
  const sourceAndFormulaMetrics = otherMetrics.filter(m => m.type !== "comparison")
  
  // Get database columns that don't have corresponding source metric rows
  const usedColumnKeys = new Set(metricRows.filter(m => m.type === "source" && m.sourceColumnKey).map(m => m.sourceColumnKey))
  const unusedDatabaseColumns = databaseColumns.filter(col => !usedColumnKeys.has(col.key))

  const isValid = label.trim() && (
    (type === "source" && sourceColumnKey) ||
    (type === "formula" && expression.trim()) ||
    (type === "comparison" && compareRowKey)
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingKey ? "Edit Row" : "Add Row"}</DialogTitle>
          <DialogDescription>
            {editingKey ? "Modify the row configuration" : "Configure a new row for your pivot report"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Row Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType("source")}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  type === "source"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Database className={`w-5 h-5 mx-auto mb-1 ${type === "source" ? "text-blue-600" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${type === "source" ? "text-blue-900" : "text-gray-700"}`}>
                  Source
                </span>
                <p className="text-xs text-gray-500 mt-0.5">From database</p>
              </button>
              <button
                type="button"
                onClick={() => setType("formula")}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  type === "formula"
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <FunctionSquare className={`w-5 h-5 mx-auto mb-1 ${type === "formula" ? "text-purple-600" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${type === "formula" ? "text-purple-900" : "text-gray-700"}`}>
                  Formula
                </span>
                <p className="text-xs text-gray-500 mt-0.5">Calculate</p>
              </button>
              <button
                type="button"
                onClick={() => setType("comparison")}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  type === "comparison"
                    ? "border-amber-500 bg-amber-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <TrendingUp className={`w-5 h-5 mx-auto mb-1 ${type === "comparison" ? "text-amber-600" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${type === "comparison" ? "text-amber-900" : "text-gray-700"}`}>
                  Compare
                </span>
                <p className="text-xs text-gray-500 mt-0.5">vs Period</p>
              </button>
            </div>
          </div>

          {/* Source Column Selection - auto-fills label and format */}
          {type === "source" && (
            <div className="space-y-2">
              <Label>Database Column *</Label>
              <Select 
                value={sourceColumnKey} 
                onValueChange={(colKey) => {
                  setSourceColumnKey(colKey)
                  // Auto-fill label and format from column
                  const col = databaseColumns.find(c => c.key === colKey)
                  if (col) {
                    setLabel(col.label)
                    // Map dataType to format
                    const formatMap: Record<string, "text" | "number" | "currency" | "percent"> = {
                      text: "text",
                      number: "number",
                      currency: "currency",
                      date: "text",
                      boolean: "text",
                    }
                    setFormat(formatMap[col.dataType] || "text")
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a column..." />
                </SelectTrigger>
                <SelectContent>
                  {databaseColumns.map((col) => (
                    <SelectItem key={col.key} value={col.key}>
                      <div className="flex items-center gap-2">
                        <span>{col.label}</span>
                        <span className="text-xs text-gray-400">({col.dataType})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Label - only for Formula and Comparison types */}
          {(type === "formula" || type === "comparison") && (
            <div className="space-y-2">
              <Label>Label *</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={type === "formula" ? "e.g., Gross Profit, Net Margin" : "e.g., YoY Revenue Change"}
              />
            </div>
          )}

          {/* Formula Input */}
          {type === "formula" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Formula Expression *</Label>
                <Input
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder="e.g., [Revenue] - [Costs]"
                />
                <p className="text-xs text-gray-500">
                  Click row names below or type [Row Name] to reference other rows
                </p>
              </div>

              {sourceAndFormulaMetrics.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Click to add row reference
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {sourceAndFormulaMetrics.map(m => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setExpression(prev => prev + (prev ? " " : "") + `[${m.label || m.key}]`)}
                        className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs"
                      >
                        {m.label || m.key}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Database columns not yet added as rows */}
              {unusedDatabaseColumns.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Database columns (click to add as row)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {unusedDatabaseColumns.map(col => (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => {
                          // Add as source row and insert reference
                          const newKey = onAddSourceRow(col)
                          // Insert reference using the column's label
                          setExpression(prev => prev + (prev ? " " : "") + `[${col.label}]`)
                        }}
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs border border-dashed border-gray-300"
                        title={`Click to add "${col.label}" as a source row and reference it`}
                      >
                        + {col.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    Clicking will add the column as a new source row
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Comparison Configuration */}
          {type === "comparison" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Compare Row *</Label>
                <Select value={compareRowKey} onValueChange={setCompareRowKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a row to compare..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceAndFormulaMetrics.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label || m.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Select which row to compare against a previous period
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Period</Label>
                  <Select value={comparePeriod} onValueChange={(v) => setComparePeriod(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mom">Month over Month</SelectItem>
                      <SelectItem value="qoq">Quarter over Quarter</SelectItem>
                      <SelectItem value="yoy">Year over Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Output</Label>
                  <Select value={compareOutput} onValueChange={(v) => setCompareOutput(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">Previous Value</SelectItem>
                      <SelectItem value="delta">Difference (Δ)</SelectItem>
                      <SelectItem value="percent">% Change</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Display Format - only for Formula and Comparison (Source uses schema) */}
          {(type === "formula" || type === "comparison") && (
            <div className="space-y-2">
              <Label>Display Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="currency">Currency ($)</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="percent">Percentage (%)</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {editingKey && (
              <Button
                variant="outline"
                onClick={() => onDelete(editingKey)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isValid}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {editingKey ? "Update" : "Add"} Row
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// Pivot Formula Column Modal Component
// ============================================
interface PivotFormulaColumnModalProps {
  open: boolean
  editingKey: string | null
  pivotFormulaColumns: PivotFormulaColumn[]
  pivotValues: string[]  // Available pivot column labels for reference
  onClose: () => void
  onSave: (column: PivotFormulaColumn) => void
  onDelete: (key: string) => void
}

function PivotFormulaColumnModal({
  open,
  editingKey,
  pivotFormulaColumns,
  pivotValues,
  onClose,
  onSave,
  onDelete,
}: PivotFormulaColumnModalProps) {
  const [label, setLabel] = useState("")
  const [expression, setExpression] = useState("")

  const editingColumn = editingKey
    ? pivotFormulaColumns.find(c => c.key === editingKey)
    : null

  // Reset form when opening
  useEffect(() => {
    if (open) {
      if (editingColumn) {
        setLabel(editingColumn.label)
        setExpression(editingColumn.expression)
      } else {
        setLabel("")
        setExpression("")
      }
    }
  }, [open, editingColumn])

  const handleSave = () => {
    if (!label.trim() || !expression.trim()) return

    const key = editingKey || `pfc_${Date.now()}`
    onSave({
      key,
      label: label.trim(),
      expression: expression.trim(),
      order: editingColumn?.order ?? pivotFormulaColumns.length,
    })
  }

  const insertExpression = (expr: string) => {
    setExpression(prev => prev + (prev ? " " : "") + expr)
  }

  const isValid = label.trim() && expression.trim()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingKey ? "Edit Formula Column" : "Add Formula Column"}</DialogTitle>
          <DialogDescription>
            Create a computed column that aggregates across pivot columns
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Label */}
          <div className="space-y-2">
            <Label>Column Label *</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Total, Combo, Average"
            />
          </div>

          {/* Expression */}
          <div className="space-y-2">
            <Label>Formula Expression *</Label>
            <Input
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="e.g., SUM(*) or [Col A] + [Col B]"
              className="font-mono"
            />
            <p className="text-xs text-gray-500">
              Use SUM(*) to total all columns, or [Column Name] to reference specific columns
            </p>
          </div>

          {/* Quick Actions */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Quick formulas
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => insertExpression("SUM(*)")}
                className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-xs font-medium"
              >
                SUM(*)
              </button>
              <button
                type="button"
                onClick={() => insertExpression("AVG(*)")}
                className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-xs font-medium"
              >
                AVG(*)
              </button>
              <button
                type="button"
                onClick={() => insertExpression("MIN(*)")}
                className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-xs font-medium"
              >
                MIN(*)
              </button>
              <button
                type="button"
                onClick={() => insertExpression("MAX(*)")}
                className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-xs font-medium"
              >
                MAX(*)
              </button>
            </div>
          </div>

          {/* Available Pivot Columns */}
          {pivotValues.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Click to reference specific columns
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {pivotValues.map(pv => (
                  <button
                    key={pv}
                    type="button"
                    onClick={() => insertExpression(`[${pv}]`)}
                    className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs"
                  >
                    {pv}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div>
            {editingKey && (
              <Button
                variant="ghost"
                onClick={() => onDelete(editingKey)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isValid}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {editingKey ? "Update" : "Add"} Column
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Note: Formula evaluation has been moved to server-side (lib/services/report-execution.service.ts)
// using a safe expression evaluator that doesn't use Function() or eval()
