"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
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
  type: "source" | "formula"
  sourceColumnKey?: string
  expression?: string
  format: "text" | "number" | "currency" | "percent"
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
  layout: "standard" | "pivot"
  // Standard layout fields
  columns: ReportColumn[]
  formulaRows: ReportFormulaRow[]
  // Pivot layout fields
  pivotColumnKey: string | null
  metricRows: MetricRow[]
  database: {
    id: string
    name: string
    schema: DatabaseSchema
    rowCount: number
    rows: Array<Record<string, unknown>>
  }
}

const CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
}

interface PreviewData {
  columns: Array<{
    key: string
    label: string
    dataType: string
    type: "source" | "formula"
  }>
  dataRows: Array<Record<string, unknown>>
  formulaRows: Array<{
    key: string
    label: string
    values: Record<string, unknown>
  }>
  metadata: {
    rowCount: number
    databaseName: string
  }
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

  // Preview is now computed locally from reportColumns and database rows

  // UI state
  const [columnsExpanded, setColumnsExpanded] = useState(true)
  const [formulaRowsExpanded, setFormulaRowsExpanded] = useState(true)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Modal state
  const [formulaColumnPanel, setFormulaColumnPanel] = useState<{
    open: boolean
    editingKey: string | null  // null = new, string = editing existing
  }>({ open: false, editingKey: null })
  const [formulaRowModal, setFormulaRowModal] = useState<{
    open: boolean
    editingKey: string | null
  }>({ open: false, editingKey: null })
  const [metricRowPanel, setMetricRowPanel] = useState<{
    open: boolean
    editingKey: string | null
  }>({ open: false, editingKey: null })

  // Editing state - Standard layout
  const [reportColumns, setReportColumns] = useState<ReportColumn[]>([])
  const [reportFormulaRows, setReportFormulaRows] = useState<ReportFormulaRow[]>([])
  
  // Editing state - Pivot layout
  const [pivotColumnKey, setPivotColumnKey] = useState<string | null>(null)
  const [metricRows, setMetricRows] = useState<MetricRow[]>([])

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
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // Compute preview locally from current selections and database rows
  const preview = useMemo((): PreviewData | null => {
    if (!report) return null
    
    const databaseRows = (report.database.rows || []) as Array<Record<string, unknown>>
    
    // === PIVOT LAYOUT ===
    if (report.layout === "pivot") {
      if (!pivotColumnKey || metricRows.length === 0) return null
      
      // Get unique pivot values (these become column headers)
      const pivotValues = [...new Set(
        databaseRows.map(r => String(r[pivotColumnKey] || ""))
      )].filter(v => v !== "").sort()
      
      if (pivotValues.length === 0) return null
      
      // Build data map: { pivotValue: rowData }
      const dataByPivot: Record<string, Record<string, unknown>> = {}
      for (const row of databaseRows) {
        const pivotVal = String(row[pivotColumnKey] || "")
        if (pivotVal) {
          dataByPivot[pivotVal] = row
        }
      }
      
      // Build columns: first is label column, rest are pivot values
      const outputColumns = [
        { key: "_label", label: "", dataType: "text", type: "source" as const },
        ...pivotValues.map(pv => ({
          key: pv,
          label: pv,
          dataType: "text",
          type: "source" as const,
        }))
      ]
      
      // Build rows: each metric row becomes a data row
      const sortedMetrics = [...metricRows].sort((a, b) => a.order - b.order)
      
      // First pass: compute source values
      const metricValuesByPivot: Record<string, Record<string, unknown>> = {}
      for (const pv of pivotValues) {
        metricValuesByPivot[pv] = {}
        for (const metric of sortedMetrics) {
          if (metric.type === "source" && metric.sourceColumnKey) {
            metricValuesByPivot[pv][metric.key] = dataByPivot[pv]?.[metric.sourceColumnKey]
          }
        }
      }
      
      // Second pass: compute formula values (can reference other metrics)
      for (const pv of pivotValues) {
        for (const metric of sortedMetrics) {
          if (metric.type === "formula" && metric.expression) {
            // Build context with other metric values for this pivot
            const context = metricValuesByPivot[pv]
            metricValuesByPivot[pv][metric.key] = evaluatePivotFormula(metric.expression, context)
          }
        }
      }
      
      // Build output rows
      const dataRows = sortedMetrics.map(metric => {
        const row: Record<string, unknown> = { _label: metric.label }
        for (const pv of pivotValues) {
          row[pv] = metricValuesByPivot[pv][metric.key]
        }
        return row
      })
      
      return {
        columns: outputColumns,
        dataRows,
        formulaRows: [],
        metadata: {
          rowCount: dataRows.length,
          databaseName: report.database.name,
        },
      }
    }
    
    // === STANDARD LAYOUT ===
    if (reportColumns.length === 0) return null

    const limitedRows = databaseRows.slice(0, 50) // Limit for preview

    // Build output columns metadata
    const outputColumns = reportColumns
      .sort((a, b) => a.order - b.order)
      .map(col => ({
        key: col.key,
        label: col.label,
        dataType: col.dataType,
        type: col.type,
      }))

    // Compute data rows with formula columns
    const dataRows = limitedRows.map(sourceRow => {
      const outputRow: Record<string, unknown> = {}

      for (const col of reportColumns) {
        if (col.type === "source" && col.sourceColumnKey) {
          outputRow[col.key] = sourceRow[col.sourceColumnKey]
        } else if (col.type === "formula" && col.expression) {
          outputRow[col.key] = evaluateRowFormula(col.expression, sourceRow)
        }
      }

      return outputRow
    })

    // Compute formula rows (aggregations)
    const formulaRowsOutput = reportFormulaRows
      .sort((a, b) => a.order - b.order)
      .map(fr => ({
        key: fr.key,
        label: fr.label,
        values: computeFormulaRowValues(fr.columnFormulas, dataRows),
      }))

    return {
      columns: outputColumns,
      dataRows,
      formulaRows: formulaRowsOutput,
      metadata: {
        rowCount: limitedRows.length,
        databaseName: report.database.name,
      },
    }
  }, [report, reportColumns, reportFormulaRows, pivotColumnKey, metricRows])

  // Save changes
  const handleSave = async () => {
    if (!report) return
    
    setSaving(true)
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
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save")
      }

      setHasUnsavedChanges(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

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
              {hasUnsavedChanges && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  Unsaved changes
                </span>
              )}
              <Button
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
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
                {report.layout === "pivot" ? (
                  <LayoutGrid className="w-4 h-4 text-blue-500" />
                ) : (
                  <Database className="w-4 h-4 text-gray-500" />
                )}
                <span className="font-medium text-gray-700">{report.database.name}</span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                  {report.layout === "pivot" ? "Pivot" : "Standard"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {report.database.rowCount.toLocaleString()} rows available
                {report.layout === "pivot" && report.pivotColumnKey && (
                  <> • Pivot: {databaseColumns.find(c => c.key === report.pivotColumnKey)?.label || report.pivotColumnKey}</>
                )}
              </p>
            </div>

            {/* === PIVOT LAYOUT UI === */}
            {report.layout === "pivot" && (
              <>
                {/* Metric Rows Section */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2.5 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-gray-700">Metric Rows</span>
                      <span className="text-xs text-gray-500">{metricRows.length} rows</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Define what data appears in each row</p>
                  </div>

                  <div className="p-3 space-y-2">
                    {metricRows.length === 0 ? (
                      <p className="text-xs text-gray-400 italic text-center py-2">
                        No metric rows defined yet
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {[...metricRows].sort((a, b) => a.order - b.order).map((metric) => (
                          <div
                            key={metric.key}
                            className={`flex items-center gap-2 p-2 rounded ${
                              metric.type === "formula" ? "bg-purple-50" : "bg-blue-50"
                            }`}
                          >
                            {metric.type === "formula" ? (
                              <FunctionSquare className="w-4 h-4 text-purple-500 flex-shrink-0" />
                            ) : (
                              <Database className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            )}
                            <span className="text-sm text-gray-700 flex-1 truncate">{metric.label}</span>
                            <span className="text-xs text-gray-400">{metric.format}</span>
                            <button
                              onClick={() => setMetricRowPanel({ open: true, editingKey: metric.key })}
                              className="p-1 hover:bg-white/50 rounded"
                            >
                              <Settings2 className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                            <button
                              onClick={() => {
                                setMetricRows(prev => prev.filter(m => m.key !== metric.key))
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

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setMetricRowPanel({ open: true, editingKey: null })}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add Row
                      </Button>
                    </div>
                  </div>
                </div>
              </>
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
          {/* Preview header */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <div className="text-sm text-gray-600">
              Preview
              {preview && (
                <span className="text-gray-400 ml-2">
                  ({preview.metadata.rowCount} rows)
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              Live preview - updates as you select columns
            </span>
          </div>

          {/* Preview content */}
          <div className="flex-1 overflow-auto p-4">
            {!preview || preview.columns.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <p className="font-medium">No columns selected</p>
                  <p className="text-sm mt-1">Select columns from the left panel to preview your report</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {preview.columns.map((col) => (
                          <th
                            key={col.key}
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            <div className="flex items-center gap-1.5">
                              {col.type === "formula" && (
                                <FunctionSquare className="w-3.5 h-3.5 text-purple-500" />
                              )}
                              {col.label}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {preview.dataRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                          {preview.columns.map((col) => (
                            <td key={col.key} className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                              {formatCellValue(row[col.key], col.dataType)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {/* Formula rows */}
                      {preview.formulaRows.map((fr) => (
                        <tr key={fr.key} className="bg-gray-50 font-medium">
                          {preview.columns.map((col, colIndex) => (
                            <td key={col.key} className="px-4 py-2.5 text-sm text-gray-900 whitespace-nowrap">
                              {colIndex === 0 ? (
                                <span className="flex items-center gap-1.5">
                                  <FunctionSquare className="w-3.5 h-3.5 text-green-600" />
                                  {fr.label}
                                </span>
                              ) : (
                                formatCellValue(fr.values[col.key], col.dataType)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

      {/* Metric Row Panel for Pivot Layout */}
      <MetricRowPanel
        open={metricRowPanel.open}
        editingKey={metricRowPanel.editingKey}
        metricRows={metricRows}
        databaseColumns={databaseColumns}
        onClose={() => setMetricRowPanel({ open: false, editingKey: null })}
        onSave={(metric) => {
          if (metricRowPanel.editingKey) {
            // Update existing
            setMetricRows(prev =>
              prev.map(m => m.key === metricRowPanel.editingKey ? metric : m)
            )
          } else {
            // Add new
            setMetricRows(prev => [...prev, { ...metric, order: prev.length }])
          }
          setHasUnsavedChanges(true)
          setMetricRowPanel({ open: false, editingKey: null })
        }}
      />
    </div>
  )
}

// Helper to format cell values
function formatCellValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined) return "—"
  if (dataType === "currency" && typeof value === "number") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
  }
  if (dataType === "number" && typeof value === "number") {
    return value.toLocaleString()
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

  // Reset form when panel opens
  useEffect(() => {
    if (open) {
      if (editingColumn) {
        setLabel(editingColumn.label)
        setExpression(editingColumn.expression || "")
        setDataType(editingColumn.dataType as any)
      } else {
        setLabel("")
        setExpression("")
        setDataType("number")
      }
    }
  }, [open, editingColumn])

  const handleSave = () => {
    if (!label.trim() || !expression.trim()) return

    const key = editingKey || `formula_${Date.now()}`
    onSave({
      key,
      label: label.trim(),
      type: "formula",
      expression: expression.trim(),
      dataType,
      order: editingColumn?.order || 0,
    })
  }

  // Insert column key at cursor position
  const insertColumn = (columnKey: string) => {
    const input = inputRef.current
    if (input) {
      const start = input.selectionStart || expression.length
      const end = input.selectionEnd || expression.length
      const newExpression = expression.slice(0, start) + columnKey + expression.slice(end)
      setExpression(newExpression)
      // Focus and move cursor after inserted text
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + columnKey.length, start + columnKey.length)
      }, 0)
    } else {
      setExpression(expression + columnKey)
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
                  onClick={() => insertColumn(col.key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${getTypeColor(col.dataType)}`}
                  title={`${col.label} (${col.dataType})`}
                >
                  {col.key}
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
              placeholder="e.g., (contract_amount - costs) / contract_amount * 100"
              className="font-mono text-sm"
            />
            {expression && (
              <div className="p-2 bg-gray-50 rounded text-xs font-mono text-gray-600 break-all">
                {expression}
              </div>
            )}
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
// Metric Row Panel Component (for Pivot Layout)
// ============================================
interface MetricRowPanelProps {
  open: boolean
  editingKey: string | null
  metricRows: MetricRow[]
  databaseColumns: Array<{ key: string; label: string; dataType: string }>
  onClose: () => void
  onSave: (metric: MetricRow) => void
}

function MetricRowPanel({
  open,
  editingKey,
  metricRows,
  databaseColumns,
  onClose,
  onSave,
}: MetricRowPanelProps) {
  const [label, setLabel] = useState("")
  const [type, setType] = useState<"source" | "formula">("source")
  const [sourceColumnKey, setSourceColumnKey] = useState("")
  const [expression, setExpression] = useState("")
  const [format, setFormat] = useState<"text" | "number" | "currency" | "percent">("number")
  
  const inputRef = useRef<HTMLInputElement>(null)

  const editingMetric = editingKey
    ? metricRows.find(m => m.key === editingKey)
    : null

  // Initialize form when editing
  useEffect(() => {
    if (open && editingMetric) {
      setLabel(editingMetric.label)
      setType(editingMetric.type)
      setSourceColumnKey(editingMetric.sourceColumnKey || "")
      setExpression(editingMetric.expression || "")
      setFormat(editingMetric.format)
    } else if (open && !editingKey) {
      setLabel("")
      setType("source")
      setSourceColumnKey("")
      setExpression("")
      setFormat("number")
    }
  }, [open, editingKey, editingMetric])

  // Focus input when panel opens
  useEffect(() => {
    if (open && type === "formula") {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, type])

  const handleSave = () => {
    if (!label.trim()) return
    if (type === "source" && !sourceColumnKey) return
    if (type === "formula" && !expression.trim()) return

    const key = editingKey || `metric_${Date.now()}`
    onSave({
      key,
      label: label.trim(),
      type,
      sourceColumnKey: type === "source" ? sourceColumnKey : undefined,
      expression: type === "formula" ? expression.trim() : undefined,
      format,
      order: editingMetric?.order || 0,
    })
  }

  // Insert metric key at cursor position
  const insertMetric = (metricKey: string) => {
    const input = inputRef.current
    if (input) {
      const start = input.selectionStart || expression.length
      const end = input.selectionEnd || expression.length
      const newExpression = expression.slice(0, start) + metricKey + expression.slice(end)
      setExpression(newExpression)
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + metricKey.length, start + metricKey.length)
      }, 0)
    } else {
      setExpression(prev => prev + metricKey)
    }
  }

  // Insert operator
  const insertOperator = (op: string) => {
    const input = inputRef.current
    if (input) {
      const start = input.selectionStart || expression.length
      const end = input.selectionEnd || expression.length
      const newExpression = expression.slice(0, start) + ` ${op} ` + expression.slice(end)
      setExpression(newExpression)
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + op.length + 2, start + op.length + 2)
      }, 0)
    } else {
      setExpression(prev => prev + ` ${op} `)
    }
  }

  // Get other metrics for formula references
  const otherMetrics = metricRows.filter(m => m.key !== editingKey && m.type === "source")

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-900">
            {editingKey ? "Edit Metric Row" : "Add Metric Row"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Row Label */}
          <div className="space-y-2">
            <Label>Row Label *</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Construction Income, GP%"
            />
          </div>

          {/* Type Selection */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("source")}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  type === "source"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Database className={`w-4 h-4 ${type === "source" ? "text-blue-600" : "text-gray-500"}`} />
                  <span className={`text-sm font-medium ${type === "source" ? "text-blue-900" : "text-gray-700"}`}>
                    Source Field
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Pull from database</p>
              </button>
              <button
                type="button"
                onClick={() => setType("formula")}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  type === "formula"
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FunctionSquare className={`w-4 h-4 ${type === "formula" ? "text-purple-600" : "text-gray-500"}`} />
                  <span className={`text-sm font-medium ${type === "formula" ? "text-purple-900" : "text-gray-700"}`}>
                    Formula
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Calculate from other rows</p>
              </button>
            </div>
          </div>

          {/* Source Column Selection */}
          {type === "source" && (
            <div className="space-y-2">
              <Label>Source Column *</Label>
              <Select value={sourceColumnKey} onValueChange={setSourceColumnKey}>
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

          {/* Formula Input */}
          {type === "formula" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Formula Expression *</Label>
                <Input
                  ref={inputRef}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder="e.g., gross_profit / revenue * 100"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Reference other source row keys to create calculations
                </p>
              </div>

              {/* Quick operators */}
              <div className="flex flex-wrap gap-1">
                {["+", "-", "*", "/", "(", ")"].map(op => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => insertOperator(op)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm font-mono"
                  >
                    {op}
                  </button>
                ))}
              </div>

              {/* Available metrics to reference */}
              {otherMetrics.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Available Fields
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {otherMetrics.map(m => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => insertMetric(m.key)}
                        className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-mono"
                      >
                        {m.key}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Format Selection */}
          <div className="space-y-2">
            <Label>Display Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="currency">Currency ($)</SelectItem>
                <SelectItem value="percent">Percentage (%)</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !label.trim() ||
              (type === "source" && !sourceColumnKey) ||
              (type === "formula" && !expression.trim())
            }
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
          >
            {editingKey ? "Update" : "Add"} Row
          </Button>
        </div>
      </div>
    </>
  )
}

// ============================================
// Formula Evaluation Helpers
// ============================================

/**
 * Evaluate a formula expression for a single row
 */
/**
 * Parse a value that might be a currency string, number, or plain string
 * Handles: $1,000,000 | 1,000,000 | 1000000 | "1000000"
 */
function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return value
  }
  if (typeof value === "string") {
    // Remove currency symbols, commas, and whitespace
    const cleaned = value.replace(/[$£€,\s]/g, "")
    const num = Number(cleaned)
    if (!isNaN(num)) {
      return num
    }
  }
  return null
}

function evaluateRowFormula(
  expression: string,
  row: Record<string, unknown>
): unknown {
  try {
    let expr = expression
    const columnRefs = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
    
    for (const ref of columnRefs) {
      if (ref in row) {
        const numValue = parseNumericValue(row[ref])
        if (numValue !== null) {
          expr = expr.replace(new RegExp(`\\b${ref}\\b`, "g"), String(numValue))
        } else {
          // Non-numeric value, replace with 0
          expr = expr.replace(new RegExp(`\\b${ref}\\b`, "g"), "0")
        }
      }
    }

    // Validate expression only contains safe characters
    if (!/^[\d\s+\-*/().]+$/.test(expr)) {
      return null
    }

    const result = Function(`"use strict"; return (${expr})`)()

    if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
      return Math.round(result * 100) / 100
    }

    return null
  } catch {
    return null
  }
}

/**
 * Evaluate a pivot formula - uses other metric row values as context
 * E.g., "gross_profit / construction_income * 100" where gross_profit and construction_income
 * are other metric row keys
 */
function evaluatePivotFormula(
  expression: string,
  context: Record<string, unknown>
): unknown {
  try {
    let expr = expression
    const metricRefs = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
    
    for (const ref of metricRefs) {
      if (ref in context) {
        const numValue = parseNumericValue(context[ref])
        if (numValue !== null) {
          expr = expr.replace(new RegExp(`\\b${ref}\\b`, "g"), String(numValue))
        } else {
          expr = expr.replace(new RegExp(`\\b${ref}\\b`, "g"), "0")
        }
      }
    }

    // Validate expression only contains safe characters
    if (!/^[\d\s+\-*/().]+$/.test(expr)) {
      return null
    }

    const result = Function(`"use strict"; return (${expr})`)()

    if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
      return Math.round(result * 100) / 100
    }

    return null
  } catch {
    return null
  }
}

/**
 * Compute formula row values (aggregations like SUM, AVG, COUNT)
 */
function computeFormulaRowValues(
  columnFormulas: Record<string, string>,
  dataRows: Array<Record<string, unknown>>
): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const [columnKey, formula] of Object.entries(columnFormulas)) {
    const upperFormula = formula.toUpperCase().trim()
    
    const numericValues: number[] = dataRows
      .map(row => parseNumericValue(row[columnKey]))
      .filter((v): v is number => v !== null)

    if (numericValues.length === 0) {
      values[columnKey] = null
      continue
    }

    switch (upperFormula) {
      case "SUM":
        values[columnKey] = Math.round(numericValues.reduce((a, b) => a + b, 0) * 100) / 100
        break
      case "AVG":
      case "AVERAGE":
        values[columnKey] = Math.round((numericValues.reduce((a, b) => a + b, 0) / numericValues.length) * 100) / 100
        break
      case "COUNT":
        values[columnKey] = numericValues.length
        break
      case "MIN":
        values[columnKey] = Math.min(...numericValues)
        break
      case "MAX":
        values[columnKey] = Math.max(...numericValues)
        break
      default:
        values[columnKey] = null
    }
  }

  return values
}
