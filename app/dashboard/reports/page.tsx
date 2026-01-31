"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, FileText, Search, MoreHorizontal, Trash2, Database, LayoutGrid, Table2, Calendar, Filter, Download, Eye, Clock, ExternalLink, Loader2, X, RefreshCw, FunctionSquare, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { 
  ReportFilterSelector, 
  type FilterableProperty, 
  type FilterBindings 
} from "@/components/reports/report-filter-selector"
import { 
  ReportInsightsPanel, 
  InsightsButton 
} from "@/components/reports/report-insights-panel"

interface ReportItem {
  id: string
  name: string
  description: string | null
  cadence: string
  layout: "standard" | "pivot"
  columnCount: number
  createdAt: string
  updatedAt: string
  database: {
    id: string
    name: string
  }
  createdBy: {
    name: string | null
    email: string
  }
}

interface GeneratedReportItem {
  id: string
  periodKey: string
  source?: "task" | "manual"
  generatedAt: string
  generatedBy: string
  data: {
    reportName: string
    sliceName?: string
    layout: string
    current?: { periodKey: string; label: string; rowCount: number }
    compare?: { periodKey: string; label: string; rowCount: number } | null
    table?: {
      columns: Array<{ key: string; label: string; dataType: string; type: string }>
      rows: Array<Record<string, unknown>>
      formulaRows?: Array<{ key: string; label: string; values: Record<string, unknown> }>
    }
  }
  reportDefinition?: {
    id: string
    name: string
    cadence: string
  }
  taskInstance?: {
    id: string
    name: string
  } | null
  board?: {
    id: string
    name: string
  } | null
}

interface AvailablePeriod {
  key: string
  label: string
}

const CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
}

export default function ReportsPage() {
  const router = useRouter()
  
  // Report templates state
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  // Generated reports state
  const [generatedReports, setGeneratedReports] = useState<GeneratedReportItem[]>([])
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])
  const [generatedLoading, setGeneratedLoading] = useState(true)
  const [periodFilter, setPeriodFilter] = useState<string>("all")
  const [templateFilter, setTemplateFilter] = useState<string>("all")

  // Create Report modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createReportLoading, setCreateReportLoading] = useState(false)
  const [reportName, setReportName] = useState<string>("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>("")
  const [filterBindings, setFilterBindings] = useState<FilterBindings>({})
  const [filterProperties, setFilterProperties] = useState<FilterableProperty[]>([])
  const [templatePeriods, setTemplatePeriods] = useState<AvailablePeriod[]>([])
  const [loadingTemplateData, setLoadingTemplateData] = useState(false)
  const [selectedViewerIds, setSelectedViewerIds] = useState<string[]>([])
  const [orgUsers, setOrgUsers] = useState<Array<{ id: string; name: string | null; email: string; role: string }>>([])
  const [loadingOrgUsers, setLoadingOrgUsers] = useState(false)

  // Report Viewer modal state
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewingReport, setViewingReport] = useState<GeneratedReportItem | null>(null)
  const [viewerInsightsOpen, setViewerInsightsOpen] = useState(false)

  // Fetch filter properties and periods when template changes
  const fetchTemplateData = useCallback(async (templateId: string) => {
    if (!templateId) {
      setFilterProperties([])
      setTemplatePeriods([])
      return
    }
    try {
      setLoadingTemplateData(true)
      // Fetch filter properties and available periods in parallel
      const [filterRes, previewRes] = await Promise.all([
        fetch(`/api/reports/${templateId}/filter-properties`, { credentials: "include" }),
        fetch(`/api/reports/${templateId}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ compareMode: "none" }),
        }),
      ])
      
      if (filterRes.ok) {
        const data = await filterRes.json()
        setFilterProperties(data.properties || [])
      }
      
      if (previewRes.ok) {
        const data = await previewRes.json()
        setTemplatePeriods(data.availablePeriods || [])
        // Auto-select first period if available
        if (data.availablePeriods?.length > 0 && !selectedPeriodKey) {
          setSelectedPeriodKey(data.availablePeriods[0].key)
        }
      }
    } catch (error) {
      console.error("Error fetching template data:", error)
    } finally {
      setLoadingTemplateData(false)
    }
  }, [selectedPeriodKey])

  // Handle template selection change
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setFilterBindings({})
    setSelectedPeriodKey("")
    fetchTemplateData(templateId)
  }

  // Create manual report
  const handleCreateReport = async () => {
    if (!selectedTemplateId || !selectedPeriodKey) return

    // Clean up filter bindings (remove empty arrays)
    const cleanedFilters: FilterBindings = {}
    for (const [key, values] of Object.entries(filterBindings)) {
      if (values.length > 0) {
        cleanedFilters[key] = values
      }
    }

    try {
      setCreateReportLoading(true)
      const response = await fetch("/api/generated-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reportDefinitionId: selectedTemplateId,
          filterBindings: Object.keys(cleanedFilters).length > 0 ? cleanedFilters : undefined,
          periodKey: selectedPeriodKey,
          name: reportName.trim() || undefined,
          viewerIds: selectedViewerIds.length > 0 ? selectedViewerIds : undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        // Close modal and refresh list
        setIsCreateModalOpen(false)
        setReportName("")
        setSelectedTemplateId("")
        setFilterBindings({})
        setSelectedPeriodKey("")
        setSelectedViewerIds([])
        fetchGeneratedReports()
        
        // Open the newly created report in viewer
        if (data.report) {
          openReportViewer(data.report)
        }
      } else {
        const error = await response.json()
        alert(error.error || "Failed to create report")
      }
    } catch (error) {
      console.error("Error creating report:", error)
      alert("Failed to create report")
    } finally {
      setCreateReportLoading(false)
    }
  }

  // Open report viewer
  // Open report viewer - shows fixed snapshot data
  const openReportViewer = (report: GeneratedReportItem) => {
    setViewingReport(report)
    setViewerOpen(true)
  }

  // Format cell value for display
  const formatCellValue = (value: unknown, format?: string): string => {
    if (value === null || value === undefined) return "—"
    
    // Coerce string numbers to actual numbers for formatting
    let numValue: number | null = null
    if (typeof value === "number") {
      numValue = value
    } else if (typeof value === "string" && !isNaN(Number(value)) && value.trim() !== "") {
      numValue = Number(value)
    }
    
    // Normalize format to lowercase
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

  // Download report as Excel
  const handleDownload = async (reportId: string) => {
    try {
      const response = await fetch(`/api/generated-reports/${reportId}/export`, {
        credentials: "include",
      })
      if (!response.ok) {
        throw new Error("Export failed")
      }
      
      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition")
      let filename = "report.xlsx"
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) {
          filename = match[1]
        }
      }
      
      // Download the blob
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Error downloading report:", error)
      alert("Failed to download report")
    }
  }

  // Fetch report templates
  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/reports", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setReports(data.reports || [])
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/reports"
      }
    } catch (error) {
      console.error("Error fetching reports:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch generated reports
  const fetchGeneratedReports = useCallback(async () => {
    try {
      setGeneratedLoading(true)
      const params = new URLSearchParams()
      if (periodFilter && periodFilter !== "all") {
        params.append("periodKey", periodFilter)
      }
      if (templateFilter && templateFilter !== "all") {
        params.append("reportDefinitionId", templateFilter)
      }
      
      const response = await fetch(`/api/generated-reports?${params.toString()}`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setGeneratedReports(data.reports || [])
        setAvailablePeriods(data.periods || [])
      }
    } catch (error) {
      console.error("Error fetching generated reports:", error)
    } finally {
      setGeneratedLoading(false)
    }
  }, [periodFilter, templateFilter])

  // Fetch org users (non-admins) for viewer selector
  const fetchOrgUsers = useCallback(async () => {
    if (orgUsers.length > 0) return // Already fetched
    try {
      setLoadingOrgUsers(true)
      const response = await fetch("/api/org/users", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        // Filter to non-admin users for the viewer selector
        const nonAdminUsers = (data.users || []).filter((u: any) => u.role !== "ADMIN")
        setOrgUsers(nonAdminUsers)
      }
    } catch (error) {
      console.error("Error fetching org users:", error)
    } finally {
      setLoadingOrgUsers(false)
    }
  }, [orgUsers.length])

  useEffect(() => {
    fetchReports()
    fetchGeneratedReports()
  }, [fetchReports, fetchGeneratedReports])

  // Fetch org users when create modal opens
  useEffect(() => {
    if (isCreateModalOpen) {
      fetchOrgUsers()
    }
  }, [isCreateModalOpen, fetchOrgUsers])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (response.ok) {
        setReports(prev => prev.filter(r => r.id !== id))
      } else {
        const error = await response.json()
        alert(error.error || "Failed to delete report")
      }
    } catch (error) {
      console.error("Error deleting report:", error)
      alert("Failed to delete report")
    }
  }

  const filteredReports = reports.filter(report => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      report.name.toLowerCase().includes(query) ||
      (report.description?.toLowerCase().includes(query) ?? false) ||
      report.database.name.toLowerCase().includes(query)
    )
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            Build report templates and view system-generated reports
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
        {/* ============================================ */}
        {/* SECTION 1: Report Builder */}
        {/* ============================================ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Report Builder</h2>
              <p className="text-sm text-gray-500">Create and manage report templates with formulas and aggregations</p>
            </div>
            <Link href="/dashboard/reports/new">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </Link>
          </div>

          {/* Search */}
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center py-12 bg-white rounded-lg border border-gray-200">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : filteredReports.length === 0 ? (
            /* Empty state */
            <div className="text-center py-10 bg-white rounded-lg border border-gray-200">
              <FileText className="mx-auto h-10 w-10 text-gray-400" />
              <h3 className="mt-3 text-base font-medium text-gray-900">
                {searchQuery ? "No templates found" : "No report templates yet"}
              </h3>
              <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                {searchQuery
                  ? "Try adjusting your search terms"
                  : "Create your first report template to define columns, formulas, and aggregations."}
              </p>
              {!searchQuery && (
                <div className="mt-4">
                  <Link href="/dashboard/reports/new">
                    <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Template
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            /* Report grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <Link href={`/dashboard/reports/${report.id}`} className="block p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {report.name}
                          </h3>
                          {report.description && (
                            <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                              {report.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault()
                              handleDelete(report.id, report.name)
                            }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                        {CADENCE_LABELS[report.cadence] || report.cadence}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                        report.layout === "pivot" 
                          ? "bg-purple-100 text-purple-700" 
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {report.layout === "pivot" ? (
                          <><LayoutGrid className="w-3 h-3" /> Pivot</>
                        ) : (
                          <><Table2 className="w-3 h-3" /> Standard</>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {report.database.name}
                      </span>
                      <span>{report.columnCount} columns</span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ============================================ */}
        {/* SECTION 2: Generated Reports */}
        {/* ============================================ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Generated Reports</h2>
              <p className="text-sm text-gray-500">Reports produced during accounting periods or created manually</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  {availablePeriods.map((period) => (
                    <SelectItem key={period} value={period}>
                      {period}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={templateFilter} onValueChange={setTemplateFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <Filter className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Templates</SelectItem>
                  {reports.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={() => setIsCreateModalOpen(true)} 
                className="bg-orange-500 hover:bg-orange-600 text-white"
                disabled={reports.length === 0}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Report
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Report Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Filters
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Generated
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {generatedLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mx-auto" />
                    </td>
                  </tr>
                ) : generatedReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <Clock className="mx-auto h-8 w-8 text-gray-300" />
                      <p className="mt-2 text-sm text-gray-500">No generated reports yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Use "Create Report" to generate reports from your report templates
                      </p>
                    </td>
                  </tr>
                ) : (
                  generatedReports.map((report) => (
                    <tr 
                      key={report.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => openReportViewer(report)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span className="font-medium text-gray-900 hover:text-blue-600">
                            {report.data?.reportName || "Untitled Report"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {report.data?.sliceName || (
                          <span className="text-gray-400">All Data</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {report.periodKey}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {format(new Date(report.generatedAt), "MMM d, yyyy h:mm a")}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {report.source === "manual" || !report.taskInstance ? (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                            Manual
                          </span>
                        ) : (
                          <span
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              href={`/dashboard/jobs/${report.taskInstance.id}`}
                              className="flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              {report.taskInstance.name}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            title="Download Excel"
                            onClick={() => handleDownload(report.id)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Create Report Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create Report</DialogTitle>
            <DialogDescription>
              Generate a new report from an existing template for a specific period.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Report Name */}
            <div className="grid gap-2">
              <Label htmlFor="reportName">Report Name (optional)</Label>
              <Input
                id="reportName"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Leave blank to use template name"
              />
            </div>

            {/* Template Selection */}
            <div className="grid gap-2">
              <Label htmlFor="template">Report Template</Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {reports.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Period Selection */}
            <div className="grid gap-2">
              <Label htmlFor="period">Period</Label>
              <Select 
                value={selectedPeriodKey} 
                onValueChange={setSelectedPeriodKey}
                disabled={!selectedTemplateId || loadingTemplateData}
              >
                <SelectTrigger id="period">
                  {loadingTemplateData ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading periods...</span>
                    </div>
                  ) : (
                    <SelectValue placeholder="Select a period..." />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {templatePeriods.map((period) => (
                    <SelectItem key={period.key} value={period.key}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter Selection */}
            {selectedTemplateId && (
              <div className="grid gap-2">
                <Label>Filters (optional)</Label>
                <ReportFilterSelector
                  properties={filterProperties}
                  value={filterBindings}
                  onChange={setFilterBindings}
                  loading={loadingTemplateData}
                />
              </div>
            )}

            {/* Viewer Selection */}
            <div className="grid gap-2">
              <Label>Share with (optional)</Label>
              <p className="text-xs text-gray-500">Admins can always see all reports. Select team members who should have access.</p>
              {loadingOrgUsers ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading team members...
                </div>
              ) : orgUsers.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">No team members available</p>
              ) : (
                <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
                  {orgUsers.map((user) => (
                    <label 
                      key={user.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={selectedViewerIds.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedViewerIds([...selectedViewerIds, user.id])
                          } else {
                            setSelectedViewerIds(selectedViewerIds.filter(id => id !== user.id))
                          }
                        }}
                        className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-sm text-gray-700">
                        {user.name || user.email}
                        {user.name && <span className="text-gray-400 ml-1">({user.email})</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateReport}
              disabled={!selectedTemplateId || !selectedPeriodKey || createReportLoading}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createReportLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Report"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Viewer Modal */}
      <Dialog open={viewerOpen} onOpenChange={(open) => !open && setViewerOpen(false)}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  {viewingReport?.data.reportName || "Report"}
                </DialogTitle>
                <DialogDescription>
                  {viewingReport?.data.sliceName && (
                    <span className="text-blue-600">{viewingReport.data.sliceName} • </span>
                  )}
                  Generated {viewingReport?.generatedAt && format(new Date(viewingReport.generatedAt), "MMM d, yyyy h:mm a")}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <InsightsButton
                  onClick={() => setViewerInsightsOpen(true)}
                  disabled={!viewingReport?.periodKey || !viewingReport?.reportDefinition?.id}
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => viewingReport && handleDownload(viewingReport.id)}
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Export Excel
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Report Info Bar */}
          <div className="flex-shrink-0 flex items-center gap-4 py-3 border-b border-gray-200 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="font-medium">Period:</span>
              <span>{viewingReport?.periodKey}</span>
            </div>
            {viewingReport?.data?.sliceName && (
              <div className="flex items-center gap-2">
                <span className="font-medium">Filters:</span>
                <span>{viewingReport.data.sliceName}</span>
              </div>
            )}
          </div>

          {/* Report Data Table */}
          <div className="flex-1 overflow-auto mt-4">
            {!viewingReport?.data?.table || !viewingReport.data.table.columns?.length || !viewingReport.data.table.rows ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No data available</p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr className="border-b-2 border-gray-200">
                      {viewingReport.data.table.columns.map((col, colIndex) => (
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
                    {viewingReport.data.table.rows.slice(0, 50).map((row, rowIndex) => {
                      const rowType = row._type as string | undefined
                      return (
                        <tr 
                          key={`row-${row._label || rowIndex}`} 
                          className={`hover:bg-blue-50 transition-colors ${rowIndex % 2 === 1 ? "bg-gray-50" : "bg-white"}`}
                        >
                          {viewingReport.data.table.columns.map((col, colIndex) => {
                            const effectiveFormat = col.key === "_label" 
                              ? "text" 
                              : ((row._format as string) || col.dataType)
                            const isLabelColumn = col.key === "_label"
                            return (
                              <td 
                                key={col.key} 
                                className={`px-4 py-3 text-gray-700 border-b border-gray-100 ${
                                  colIndex > 0 ? "border-l border-gray-100" : ""
                                }`}
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
                      )
                    })}
                  </tbody>
                  {viewingReport.data.table.formulaRows && viewingReport.data.table.formulaRows.length > 0 && (
                    <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                      {viewingReport.data.table.formulaRows.map((fRow) => (
                        <tr key={fRow.key}>
                          {viewingReport.data.table.columns.map((col, colIndex) => (
                            <td
                              key={col.key}
                              className={`px-4 py-3 text-gray-900 ${
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
                {viewingReport.data.table.rows.length > 50 && (
                  <p className="text-xs text-gray-400 text-center py-2 bg-gray-50 border-t border-gray-100">
                    Showing 50 of {viewingReport.data.table.rows.length} rows
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Insights Panel for Viewer */}
      {viewerInsightsOpen && viewingReport?.reportDefinition?.id && viewingReport?.periodKey && (
        <ReportInsightsPanel
          reportId={viewingReport.reportDefinition.id}
          periodKey={viewingReport.periodKey}
          compareMode="mom"
          onClose={() => setViewerInsightsOpen(false)}
        />
      )}
    </div>
  )
}
