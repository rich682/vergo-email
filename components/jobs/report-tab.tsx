"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { FileText, Loader2, LayoutGrid, Table2, RefreshCw, Calendar, Lock, Settings, X, FunctionSquare, TrendingUp, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ReportInsightsPanel,
  InsightsButton
} from "@/components/reports/report-insights-panel"
// XLSX is lazy-loaded in handleExportExcel to reduce initial bundle size

// ============================================
// Types
// ============================================

interface ReportDefinition {
  id: string
  name: string
  description: string | null
  cadence: string
  layout: "standard" | "pivot"
  filterBindings: Record<string, string[]> | null
  database: {
    id: string
    name: string
  }
}

interface PreviewResult {
  current: { periodKey: string; label: string; rowCount: number } | null
  compare: { periodKey: string; label: string; rowCount: number } | null
  availablePeriods: Array<{ key: string; label: string }>
  table: {
    columns: Array<{ key: string; label: string; dataType: string; type: string }>
    rows: Array<Record<string, unknown>>
    formulaRows?: Array<{ key: string; label: string; values: Record<string, unknown> }>
  }
}

interface ReportTabProps {
  jobId: string
  reportDefinitionId: string | null
  boardPeriodStart?: string | null
  boardCadence?: string | null
  onConfigChange?: (config: { reportDefinitionId: string | null }) => void
  canManageReports?: boolean  // Controls whether configuration UI is shown
}

const CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
}

// ============================================
// Component
// ============================================

export function ReportTab({
  jobId,
  reportDefinitionId,
  boardPeriodStart,
  boardCadence,
  onConfigChange,
  canManageReports = false,
}: ReportTabProps) {
  // Derived state
  const isConfigured = !!reportDefinitionId

  // Config editing state
  const [isEditingConfig, setIsEditingConfig] = useState(!isConfigured && canManageReports)
  const [editReportId, setEditReportId] = useState<string | null>(reportDefinitionId)

  // Data state
  const [reports, setReports] = useState<ReportDefinition[]>([])
  const [loadingReports, setLoadingReports] = useState(true)

  // Preview state - uses SAVED config (props), not editing state
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [currentPeriodKey, setCurrentPeriodKey] = useState<string>("")

  const [saving, setSaving] = useState(false)

  // Access denied state (viewer check failed)
  const [viewerDenied, setViewerDenied] = useState(false)

  // AI Insights state
  const [insightsOpen, setInsightsOpen] = useState(false)

  // Get saved report details (for display)
  const savedReport = useMemo(() => {
    return reports.find(r => r.id === reportDefinitionId) || null
  }, [reports, reportDefinitionId])

  // Get filter summary from the report definition's baked-in filters
  const savedFilterSummary = useMemo(() => {
    const fb = savedReport?.filterBindings
    if (!fb) return null
    const activeFilters = Object.entries(fb)
      .filter(([_, values]) => values.length > 0)
    if (activeFilters.length === 0) return null
    return activeFilters
      .map(([key, values]) => values.length === 1 ? values[0] : `${values.length} ${key}`)
      .join(", ")
  }, [savedReport])

  // Get editing report details
  const editReport = useMemo(() => {
    return reports.find(r => r.id === editReportId) || null
  }, [reports, editReportId])

  // Get filter summary for the report being edited (read-only display)
  const editFilterSummary = useMemo(() => {
    const fb = editReport?.filterBindings
    if (!fb) return null
    const activeFilters = Object.entries(fb)
      .filter(([_, values]) => values.length > 0)
    if (activeFilters.length === 0) return null
    return activeFilters
      .map(([key, values]) => values.length === 1 ? values[0] : `${values.length} ${key}`)
      .join(", ")
  }, [editReport])

  // Fetch available report definitions
  const fetchReports = useCallback(async () => {
    try {
      setLoadingReports(true)
      const response = await fetch("/api/reports", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setReports(data.reports || [])
      }
    } catch (error) {
      console.error("Error fetching reports:", error)
    } finally {
      setLoadingReports(false)
    }
  }, [])

  // Fetch report preview using SAVED config
  const fetchPreview = useCallback(async () => {
    if (!reportDefinitionId) return

    setPreviewLoading(true)
    setViewerDenied(false)
    try {
      const response = await fetch(`/api/reports/${reportDefinitionId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPeriodKey: currentPeriodKey || undefined,
          compareMode: "mom",
          taskInstanceId: jobId,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setPreviewData(data)

        // Auto-select first period if none selected
        if (!currentPeriodKey && data.availablePeriods?.length > 0) {
          setCurrentPeriodKey(data.availablePeriods[0].key)
        }

        // Auto-store as GeneratedReport so it appears in Reports page
        const effectivePeriodKey = data.current?.periodKey || currentPeriodKey
        if (effectivePeriodKey) {
          fetch("/api/generated-reports/ensure-for-task", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              taskInstanceId: jobId,
              reportDefinitionId,
              periodKey: effectivePeriodKey,
            }),
          }).catch(err => {
            console.error("Error ensuring task report:", err)
          })
        }
      } else if (response.status === 403) {
        const data = await response.json().catch(() => ({}))
        if (data.error?.includes("viewer access")) {
          setViewerDenied(true)
        }
      }
    } catch (error) {
      console.error("Error fetching preview:", error)
    } finally {
      setPreviewLoading(false)
    }
  }, [reportDefinitionId, currentPeriodKey, jobId])

  // Save configuration — only links a report definition to the task
  const saveConfig = useCallback(async () => {
    if (!editReportId) {
      alert("Please select a report template")
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/task-instances/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reportDefinitionId: editReportId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("Failed to save report config:", response.status, errorData)
        alert(`Failed to save report configuration: ${errorData.error || response.statusText}`)
        return
      }

      // Update parent state
      onConfigChange?.({ reportDefinitionId: editReportId })

      // Close config panel
      setIsEditingConfig(false)
    } catch (error) {
      console.error("Error saving config:", error)
      alert("Failed to save report configuration. Please try again.")
    } finally {
      setSaving(false)
    }
  }, [jobId, editReportId, onConfigChange])

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditReportId(reportDefinitionId)
    setIsEditingConfig(false)
  }, [reportDefinitionId])

  // Open config panel for editing
  const openConfigPanel = useCallback(() => {
    setEditReportId(reportDefinitionId)
    setIsEditingConfig(true)
  }, [reportDefinitionId])

  // Initial fetch
  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  // Fetch preview when saved config or period changes
  useEffect(() => {
    if (reportDefinitionId) {
      fetchPreview()
    } else {
      setPreviewData(null)
    }
  }, [reportDefinitionId, currentPeriodKey, fetchPreview])

  // Sync editing state when props change
  useEffect(() => {
    if (!isEditingConfig) {
      setEditReportId(reportDefinitionId)
    }
  }, [reportDefinitionId, isEditingConfig])

  // Auto-open config panel for admin when unconfigured
  useEffect(() => {
    if (!isConfigured && canManageReports && !isEditingConfig) {
      setIsEditingConfig(true)
    }
  }, [isConfigured, canManageReports, isEditingConfig])

  // Handle report selection in edit mode
  const handleEditReportChange = (value: string) => {
    const newReportId = value === "_none" ? null : value
    setEditReportId(newReportId)
  }

  // Format cell value for display with proper formatting
  const formatCellValue = (value: unknown, format?: string): string => {
    if (value === null || value === undefined) return "—"

    let numValue: number | null = null
    if (typeof value === "number") {
      numValue = value
    } else if (typeof value === "string" && !isNaN(Number(value)) && value.trim() !== "") {
      numValue = Number(value)
    }

    const fmt = (format || "").toLowerCase()

    if (fmt === "currency" && numValue !== null) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numValue)
    }
    if (fmt === "percent" && numValue !== null) {
      return `${numValue.toLocaleString()}%`
    }
    if ((fmt === "number" || !fmt) && numValue !== null) {
      return numValue.toLocaleString()
    }
    return String(value)
  }

  // Export to Excel
  const handleExportExcel = useCallback(async () => {
    const XLSX = await import("xlsx")
    if (!previewData || !previewData.table.columns.length) return

    const wsData: unknown[][] = []

    const headers = previewData.table.columns.map(col => col.label || col.key)
    wsData.push(headers)

    for (const row of previewData.table.rows) {
      const rowData = previewData.table.columns.map(col => {
        const value = row[col.key]
        if (value === null || value === undefined) return ""
        return value
      })
      wsData.push(rowData)
    }

    if (previewData.table.formulaRows && previewData.table.formulaRows.length > 0) {
      wsData.push([])
      for (const formulaRow of previewData.table.formulaRows) {
        const rowData = previewData.table.columns.map((col, idx) => {
          if (idx === 0) return formulaRow.label
          const value = formulaRow.values[col.key]
          if (value === null || value === undefined) return ""
          return value
        })
        wsData.push(rowData)
      }
    }

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet(wsData)

    const colWidths = headers.map((header, idx) => {
      let maxWidth = String(header).length
      for (const row of wsData) {
        const cellValue = String(row[idx] || "")
        if (cellValue.length > maxWidth) maxWidth = cellValue.length
      }
      return { wch: Math.min(maxWidth + 2, 50) }
    })
    worksheet["!cols"] = colWidths

    const sheetName = (savedReport?.name || "Report").substring(0, 31)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

    const filename = `${savedReport?.name || "Report"} - ${currentPeriodKey || "Report"}.xlsx`
      .replace(/[/\\?%*:|"<>]/g, "-")

    XLSX.writeFile(workbook, filename)
  }, [previewData, savedReport, currentPeriodKey])

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return editReportId !== reportDefinitionId
  }, [editReportId, reportDefinitionId])

  return (
    <div className="space-y-6">
      {/* Configuration Panel - Only visible when editing (admin only) */}
      {canManageReports && isEditingConfig && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Report Configuration</h3>
            {isConfigured && (
              <button
                onClick={cancelEditing}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            {/* Report Template Selector */}
            <div className="space-y-2">
              <Label>Report Template</Label>
              <Select
                value={editReportId || "_none"}
                onValueChange={handleEditReportChange}
                disabled={loadingReports}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a report template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No template selected</SelectItem>
                  {reports.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      <div className="flex items-center gap-2">
                        {report.layout === "pivot" ? (
                          <LayoutGrid className="w-3.5 h-3.5 text-purple-500" />
                        ) : (
                          <Table2 className="w-3.5 h-3.5 text-gray-400" />
                        )}
                        <span>{report.name}</span>
                        <span className="text-xs text-gray-400">
                          ({CADENCE_LABELS[report.cadence] || report.cadence})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editReport && (
                <p className="text-xs text-gray-500">
                  Data source: {editReport.database.name}
                </p>
              )}
            </div>

            {/* Read-only filter summary from selected report definition */}
            {editReport && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Filters (configured in report template)</p>
                {editFilterSummary ? (
                  <p className="text-sm text-gray-700">{editFilterSummary}</p>
                ) : (
                  <p className="text-xs text-gray-400 italic">No filters — this report shows all data</p>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            {isConfigured && (
              <Button
                variant="outline"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={saveConfig}
              disabled={saving || !editReportId}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Preview Section - Show when configured */}
      {isConfigured && !isEditingConfig && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Preview Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-sm text-gray-700">
                {savedReport?.name || "Report"}
              </span>
              {savedFilterSummary && (
                <span className="text-xs text-gray-500 bg-blue-50 px-2 py-0.5 rounded">
                  {savedFilterSummary}
                </span>
              )}
              {previewData?.current && (
                <span className="text-xs text-gray-500">
                  ({previewData.current.rowCount} rows)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Period Selector */}
              {previewData?.availablePeriods && previewData.availablePeriods.length > 0 && (
                <Select
                  value={currentPeriodKey || "_none"}
                  onValueChange={setCurrentPeriodKey}
                >
                  <SelectTrigger className="h-8 w-[160px]">
                    <Calendar className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    {previewData.availablePeriods.map((period) => (
                      <SelectItem key={period.key} value={period.key}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={fetchPreview}
                disabled={previewLoading}
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${previewLoading ? "animate-spin" : ""}`} />
              </Button>

              {/* AI Insights Button */}
              <InsightsButton
                onClick={() => setInsightsOpen(true)}
                disabled={!reportDefinitionId || !currentPeriodKey}
              />

              {/* Export Excel Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={!previewData || !previewData.table.columns.length}
                title="Export to Excel"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export
              </Button>

              {/* Settings gear - Admin only */}
              {canManageReports && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openConfigPanel}
                  title="Configure Report"
                >
                  <Settings className="w-4 h-4 text-gray-500" />
                </Button>
              )}
            </div>
          </div>

          {/* Preview Content */}
          <div className="p-4">
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : viewerDenied ? (
              <div className="text-center py-12 text-gray-500">
                <Lock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium">You don&apos;t have access to this report</p>
                <p className="text-xs text-gray-400 mt-1">
                  Contact your administrator to request viewer access.
                </p>
              </div>
            ) : !previewData || !previewData.table.columns.length ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No preview available</p>
                <p className="text-xs text-gray-400 mt-1">
                  Select a period to view the report
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                  <thead className="bg-gray-100 sticky top-0 z-20">
                    <tr className="border-b-2 border-gray-200">
                      {previewData.table.columns.map((col, colIndex) => {
                        const isLabelColumn = col.key === "_label"
                        return (
                          <th
                            key={col.key}
                            className={`px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider ${
                              isLabelColumn
                                ? "text-left whitespace-nowrap"
                                : "text-center border-l border-gray-200"
                            }`}
                            style={{
                              width: isLabelColumn ? 200 : 120,
                              minWidth: isLabelColumn ? 200 : 120,
                              maxWidth: isLabelColumn ? 200 : 120
                            }}
                          >
                            {col.label}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.table.rows.slice(0, 20).map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className={`hover:bg-blue-50 transition-colors ${rowIndex % 2 === 1 ? "bg-gray-50" : "bg-white"}`}
                      >
                        {previewData.table.columns.map((col, colIndex) => {
                          const effectiveFormat = col.key === "_label"
                            ? "text"
                            : ((row._format as string) || col.dataType)
                          const rowType = row._type as string | undefined
                          const isLabelColumn = col.key === "_label"
                          return (
                            <td
                              key={col.key}
                              className={`px-4 py-3 border-b border-gray-100 overflow-hidden text-ellipsis whitespace-nowrap ${
                                isLabelColumn
                                  ? "font-medium text-gray-900"
                                  : "text-center border-l border-gray-100 text-gray-700"
                              }`}
                              style={{
                                width: isLabelColumn ? 200 : 120,
                                minWidth: isLabelColumn ? 200 : 120,
                                maxWidth: isLabelColumn ? 200 : 120
                              }}
                            >
                              {isLabelColumn && (rowType === "formula" || rowType === "comparison") ? (
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
                    ))}
                  </tbody>
                  {previewData.table.formulaRows && previewData.table.formulaRows.length > 0 && (
                    <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                      {previewData.table.formulaRows.map((fRow) => (
                        <tr key={fRow.key}>
                          {previewData.table.columns.map((col, colIndex) => {
                            const isLabelColumn = colIndex === 0
                            return (
                              <td
                                key={col.key}
                                className={`px-4 py-3 overflow-hidden text-ellipsis whitespace-nowrap ${
                                  isLabelColumn
                                    ? "font-medium text-gray-900"
                                    : "text-center border-l border-blue-100 text-gray-900"
                                }`}
                                style={{
                                  width: isLabelColumn ? 200 : 120,
                                  minWidth: isLabelColumn ? 200 : 120,
                                  maxWidth: isLabelColumn ? 200 : 120
                                }}
                              >
                                {isLabelColumn ? fRow.label : formatCellValue(fRow.values[col.key])}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tfoot>
                  )}
                </table>
                {previewData.table.rows.length > 20 && (
                  <p className="text-xs text-gray-400 text-center py-2 bg-gray-50 border-t border-gray-100">
                    Showing 20 of {previewData.table.rows.length} rows
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State - When unconfigured and not editing */}
      {!isConfigured && !isEditingConfig && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Lock className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <h3 className="text-base font-medium text-gray-900 mb-1">Report Not Yet Configured</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            An administrator needs to configure the report for this task.
            Please contact your admin to set up the report template and filters.
          </p>
        </div>
      )}

      {/* AI Insights Panel */}
      {insightsOpen && reportDefinitionId && currentPeriodKey && (
        <ReportInsightsPanel
          reportId={reportDefinitionId}
          periodKey={currentPeriodKey}
          compareMode="mom"
          taskInstanceId={jobId}
          onClose={() => setInsightsOpen(false)}
        />
      )}
    </div>
  )
}
