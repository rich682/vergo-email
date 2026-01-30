"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { FileText, Filter, Loader2, LayoutGrid, Table2, RefreshCw, Calendar, Lock, Settings, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ============================================
// Types
// ============================================

interface ReportDefinition {
  id: string
  name: string
  description: string | null
  cadence: string
  layout: "standard" | "pivot"
  database: {
    id: string
    name: string
  }
}

interface ReportSlice {
  id: string
  name: string
  filterBindings: Record<string, unknown>
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
  reportSliceId: string | null
  boardPeriodStart?: string | null
  boardCadence?: string | null
  onConfigChange?: (config: { reportDefinitionId: string | null; reportSliceId: string | null }) => void
  isAdmin?: boolean  // Controls whether configuration UI is shown (only admins can configure)
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
  reportSliceId,
  boardPeriodStart,
  boardCadence,
  onConfigChange,
  isAdmin = false,
}: ReportTabProps) {
  // Derived state
  const isConfigured = !!reportDefinitionId

  // Config editing state
  const [isEditingConfig, setIsEditingConfig] = useState(!isConfigured && isAdmin)
  const [editReportId, setEditReportId] = useState<string | null>(reportDefinitionId)
  const [editSliceId, setEditSliceId] = useState<string | null>(reportSliceId)

  // Data state
  const [reports, setReports] = useState<ReportDefinition[]>([])
  const [slices, setSlices] = useState<ReportSlice[]>([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [loadingSlices, setLoadingSlices] = useState(false)
  
  // Preview state - uses SAVED config (props), not editing state
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [currentPeriodKey, setCurrentPeriodKey] = useState<string>("")
  
  const [saving, setSaving] = useState(false)

  // Get saved report details (for display)
  const savedReport = useMemo(() => {
    return reports.find(r => r.id === reportDefinitionId) || null
  }, [reports, reportDefinitionId])

  // Get saved slice details (for display)
  const savedSlice = useMemo(() => {
    return slices.find(s => s.id === reportSliceId) || null
  }, [slices, reportSliceId])

  // Get editing report details
  const editReport = useMemo(() => {
    return reports.find(r => r.id === editReportId) || null
  }, [reports, editReportId])

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

  // Fetch slices for a report
  const fetchSlices = useCallback(async (reportId: string) => {
    try {
      setLoadingSlices(true)
      const response = await fetch(`/api/reports/${reportId}/slices`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setSlices(data.slices || [])
      }
    } catch (error) {
      console.error("Error fetching slices:", error)
    } finally {
      setLoadingSlices(false)
    }
  }, [])

  // Fetch report preview using SAVED config
  const fetchPreview = useCallback(async () => {
    if (!reportDefinitionId) return
    
    // Get the slice for the saved config
    const sliceForPreview = slices.find(s => s.id === reportSliceId)
    
    setPreviewLoading(true)
    try {
      const response = await fetch(`/api/reports/${reportDefinitionId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPeriodKey: currentPeriodKey || undefined,
          compareMode: "none",
          filters: sliceForPreview?.filterBindings,
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setPreviewData(data)
        
        // Auto-select first period if none selected
        if (!currentPeriodKey && data.availablePeriods?.length > 0) {
          setCurrentPeriodKey(data.availablePeriods[0].key)
        }
      }
    } catch (error) {
      console.error("Error fetching preview:", error)
    } finally {
      setPreviewLoading(false)
    }
  }, [reportDefinitionId, reportSliceId, currentPeriodKey, slices])

  // Save configuration
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
          reportSliceId: editSliceId,
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("Failed to save report config:", response.status, errorData)
        alert(`Failed to save report configuration: ${errorData.error || response.statusText}`)
        return
      }
      
      // Update parent state
      onConfigChange?.({ reportDefinitionId: editReportId, reportSliceId: editSliceId })
      
      // Close config panel
      setIsEditingConfig(false)
    } catch (error) {
      console.error("Error saving config:", error)
      alert("Failed to save report configuration. Please try again.")
    } finally {
      setSaving(false)
    }
  }, [jobId, editReportId, editSliceId, onConfigChange])

  // Cancel editing
  const cancelEditing = useCallback(() => {
    // Reset to saved values
    setEditReportId(reportDefinitionId)
    setEditSliceId(reportSliceId)
    setIsEditingConfig(false)
  }, [reportDefinitionId, reportSliceId])

  // Open config panel for editing
  const openConfigPanel = useCallback(() => {
    setEditReportId(reportDefinitionId)
    setEditSliceId(reportSliceId)
    setIsEditingConfig(true)
  }, [reportDefinitionId, reportSliceId])

  // Initial fetch
  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  // Fetch slices when report changes (for both saved and editing)
  useEffect(() => {
    const reportIdToFetch = reportDefinitionId || editReportId
    if (reportIdToFetch) {
      fetchSlices(reportIdToFetch)
    }
  }, [reportDefinitionId, editReportId, fetchSlices])

  // Fetch preview when saved config or period changes
  useEffect(() => {
    if (reportDefinitionId) {
      fetchPreview()
    } else {
      setPreviewData(null)
    }
  }, [reportDefinitionId, reportSliceId, currentPeriodKey, fetchPreview])

  // Sync editing state when props change
  useEffect(() => {
    if (!isEditingConfig) {
      setEditReportId(reportDefinitionId)
      setEditSliceId(reportSliceId)
    }
  }, [reportDefinitionId, reportSliceId, isEditingConfig])

  // Auto-open config panel for admin when unconfigured
  useEffect(() => {
    if (!isConfigured && isAdmin && !isEditingConfig) {
      setIsEditingConfig(true)
    }
  }, [isConfigured, isAdmin, isEditingConfig])

  // Handle report selection in edit mode
  const handleEditReportChange = (value: string) => {
    const newReportId = value === "_none" ? null : value
    setEditReportId(newReportId)
    setEditSliceId(null) // Clear slice when report changes
    
    // Fetch slices for new report
    if (newReportId) {
      fetchSlices(newReportId)
    }
  }

  // Handle slice selection in edit mode
  const handleEditSliceChange = (value: string) => {
    const newSliceId = value === "_all" ? null : value
    setEditSliceId(newSliceId)
  }

  // Format cell value for display
  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return "-"
    if (typeof value === "number") {
      return value.toLocaleString()
    }
    return String(value)
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = editReportId !== reportDefinitionId || editSliceId !== reportSliceId

  return (
    <div className="space-y-6">
      {/* Configuration Panel - Only visible when editing (admin only) */}
      {isAdmin && isEditingConfig && (
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            {/* Slice Selector */}
            <div className="space-y-2">
              <Label>Slice (Filter View)</Label>
              <Select
                value={editSliceId || "_all"}
                onValueChange={handleEditSliceChange}
                disabled={!editReportId || loadingSlices}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a slice..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Data (no filters)</SelectItem>
                  {slices.map((slice) => (
                    <SelectItem key={slice.id} value={slice.id}>
                      <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-blue-500" />
                        <span>{slice.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              {savedSlice && (
                <span className="text-xs text-gray-500 bg-blue-50 px-2 py-0.5 rounded">
                  {savedSlice.name}
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
              >
                <RefreshCw className={`w-3.5 h-3.5 ${previewLoading ? "animate-spin" : ""}`} />
              </Button>

              {/* Settings gear - Admin only */}
              {isAdmin && (
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
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr className="border-b-2 border-gray-200">
                      {previewData.table.columns.map((col, colIndex) => (
                        <th
                          key={col.key}
                          className={`px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${
                            colIndex > 0 ? "border-l border-gray-200" : ""
                          }`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.table.rows.slice(0, 20).map((row, rowIndex) => (
                      <tr 
                        key={rowIndex} 
                        className={`hover:bg-blue-50 transition-colors ${rowIndex % 2 === 1 ? "bg-gray-50" : "bg-white"}`}
                      >
                        {previewData.table.columns.map((col, colIndex) => (
                          <td 
                            key={col.key} 
                            className={`px-4 py-3 text-gray-700 border-b border-gray-100 ${
                              colIndex > 0 ? "border-l border-gray-100" : ""
                            }`}
                          >
                            {formatCellValue(row[col.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {previewData.table.formulaRows && previewData.table.formulaRows.length > 0 && (
                    <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                      {previewData.table.formulaRows.map((fRow) => (
                        <tr key={fRow.key}>
                          {previewData.table.columns.map((col, colIndex) => (
                            <td
                              key={col.key}
                              className={`px-4 py-3 font-medium text-gray-900 ${
                                colIndex > 0 ? "border-l border-blue-100" : ""
                              }`}
                            >
                              {colIndex === 0 ? fRow.label : formatCellValue(fRow.values[col.key])}
                            </td>
                          ))}
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
    </div>
  )
}
