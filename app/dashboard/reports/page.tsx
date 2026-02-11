"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, FileText, Search, MoreHorizontal, Trash2, Database, LayoutGrid, Table2, Calendar, Filter, Download, Eye, Clock, ExternalLink, Loader2, X, RefreshCw, FunctionSquare, TrendingUp, Scale, CheckCircle, AlertTriangle } from "lucide-react"
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

// Completed reconciliation run returned from /api/reconciliations/completed
interface CompletedReconRun {
  id: string
  configId: string
  boardId: string | null
  taskInstanceId: string | null
  status: "COMPLETE" | "REVIEW"
  sourceAFileName: string | null
  sourceBFileName: string | null
  totalSourceA: number
  totalSourceB: number
  matchedCount: number
  exceptionCount: number
  variance: number
  completedAt: string | null
  completedBy: string | null
  createdAt: string
  updatedAt: string
  config: {
    id: string
    name: string
  }
  taskInstance: {
    id: string
    name: string
    board: { id: string; name: string } | null
  } | null
  completedByUser: { id: string; name: string | null; email: string } | null
}

// Unified item type for the generated reports table
type UnifiedReportItem =
  | { type: "report"; data: GeneratedReportItem; date: string }
  | { type: "reconciliation"; data: CompletedReconRun; date: string }

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
  
  // User role state
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Report templates state (admin-only)
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  // Generated reports state
  const [generatedReports, setGeneratedReports] = useState<GeneratedReportItem[]>([])
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])
  const [generatedLoading, setGeneratedLoading] = useState(true)
  const [periodFilter, setPeriodFilter] = useState<string>("all")
  const [templateFilter, setTemplateFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")

  // Completed reconciliation runs state
  const [completedReconRuns, setCompletedReconRuns] = useState<CompletedReconRun[]>([])
  const [reconLoading, setReconLoading] = useState(true)

  // Reconciliation viewer modal state
  const [reconViewerOpen, setReconViewerOpen] = useState(false)
  const [viewingRecon, setViewingRecon] = useState<CompletedReconRun | null>(null)

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

  // Fetch user role to determine admin status
  const fetchUserRole = useCallback(async () => {
    try {
      const response = await fetch("/api/org/users", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        // The API returns isAdmin directly as a boolean
        setIsAdmin(data.isAdmin === true)
        return data.isAdmin === true
      }
    } catch (error) {
      console.error("Error fetching user role:", error)
    }
    return false
  }, [])

  // Fetch report templates (admin-only)
  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/reports", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setReports(data.reports || [])
      } else if (response.status === 401) {
        window.location.href = "/auth/signin?callbackUrl=/dashboard/reports"
      } else if (response.status === 403) {
        // Non-admin - expected, just don't show reports
        setReports([])
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

  // Fetch completed reconciliation runs
  const fetchCompletedReconRuns = useCallback(async () => {
    try {
      setReconLoading(true)
      const response = await fetch("/api/reconciliations/completed", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setCompletedReconRuns(data.runs || [])
      }
    } catch (error) {
      console.error("Error fetching completed reconciliation runs:", error)
    } finally {
      setReconLoading(false)
    }
  }, [])

  useEffect(() => {
    // Fetch user role first, then fetch appropriate data
    fetchUserRole().then((admin) => {
      if (admin) {
        fetchReports() // Only admins can see report templates
      } else {
        setLoading(false) // Skip template loading for non-admins
      }
    })
    fetchGeneratedReports() // All users can see generated reports (filtered by viewer permissions)
    fetchCompletedReconRuns() // Fetch completed reconciliation runs
  }, [fetchUserRole, fetchReports, fetchGeneratedReports, fetchCompletedReconRuns])

  // Fetch org users when create modal opens
  useEffect(() => {
    if (isCreateModalOpen) {
      fetchOrgUsers()
    }
  }, [isCreateModalOpen, fetchOrgUsers])

  const handleDelete = async (id: string, name: string) => {
    try {
      // Preflight check: see if any tasks are linked to this report
      const preflightRes = await fetch(`/api/reports/${id}?preflight=true`, {
        method: "DELETE",
        credentials: "include",
      })
      const preflightData = await preflightRes.json()
      const linkedCount = preflightData.linkedTaskCount || 0

      const message = linkedCount > 0
        ? `This report is linked to ${linkedCount} active task${linkedCount > 1 ? "s" : ""}. Deleting it will remove the report from those tasks.\n\nAre you sure you want to delete "${name}"? This action cannot be undone.`
        : `Are you sure you want to delete "${name}"? This action cannot be undone.`

      if (!confirm(message)) {
        return
      }

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

  // Merge generated reports and completed reconciliation runs into a unified, sorted list
  const unifiedItems = useMemo<UnifiedReportItem[]>(() => {
    const items: UnifiedReportItem[] = []

    // Add generated reports (filtered by period and template as before)
    if (typeFilter === "all" || typeFilter === "reports") {
      for (const report of generatedReports) {
        items.push({ type: "report", data: report, date: report.generatedAt })
      }
    }

    // Add completed reconciliation runs (apply period filter by matching createdAt month)
    if (typeFilter === "all" || typeFilter === "reconciliations") {
      for (const run of completedReconRuns) {
        // Apply period filter: match run createdAt month to the period key (e.g. "2026-01")
        if (periodFilter && periodFilter !== "all") {
          const runMonth = run.createdAt.substring(0, 7) // "YYYY-MM"
          if (runMonth !== periodFilter) continue
        }
        items.push({ type: "reconciliation", data: run, date: run.completedAt || run.createdAt })
      }
    }

    // Sort by date descending
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return items
  }, [generatedReports, completedReconRuns, typeFilter, periodFilter])

  const isUnifiedLoading = generatedLoading || reconLoading

  return (
    <div className="p-8 space-y-8">
        {/* ============================================ */}
        {/* SECTION 1: Report Builder (Admin Only) */}
        {/* ============================================ */}
        {isAdmin && (
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
            /* Report table */
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cadence</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Layout</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Database</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Columns</th>
                    <th className="w-10 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredReports.map((report) => (
                    <tr
                      key={report.id}
                      className="hover:bg-gray-50 cursor-pointer group"
                      onClick={() => router.push(`/dashboard/reports/${report.id}`)}
                    >
                      <td className="px-4 py-2">
                        <div className="text-sm font-medium text-gray-900 truncate max-w-[300px]">{report.name}</div>
                        {report.description && (
                          <div className="text-xs text-gray-500 truncate max-w-[300px]">{report.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {CADENCE_LABELS[report.cadence] || report.cadence}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1 ${
                          report.layout === "pivot"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {report.layout === "pivot" ? (
                            <><LayoutGrid className="w-3 h-3" /> Matrix</>
                          ) : (
                            <><Table2 className="w-3 h-3" /> Standard</>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-sm text-gray-700 flex items-center gap-1">
                          <Database className="w-3 h-3 text-gray-400" />
                          {report.database.name}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">{report.columnCount}</td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
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
                              onClick={() => handleDelete(report.id, report.name)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        {/* ============================================ */}
        {/* SECTION 2: Generated Reports & Reconciliations */}
        {/* ============================================ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Generated Reports</h2>
              <p className="text-sm text-gray-500">Reports and reconciliations produced during accounting periods</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[170px] h-9">
                  <Filter className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="reports">Reports</SelectItem>
                  <SelectItem value="reconciliations">Reconciliations</SelectItem>
                </SelectContent>
              </Select>
              {/* Period Filter */}
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
              {isAdmin && (
                <>
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
                </>
              )}
            </div>
          </div>

          {/* Unified Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Details
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Source
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isUnifiedLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mx-auto" />
                    </td>
                  </tr>
                ) : unifiedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <Clock className="mx-auto h-8 w-8 text-gray-300" />
                      <p className="mt-2 text-sm text-gray-500">No reports or reconciliations available</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {isAdmin 
                          ? "Generate reports from templates or run reconciliations from task pages"
                          : "You don't have access to any reports yet. Ask an admin to share reports with you."
                        }
                      </p>
                    </td>
                  </tr>
                ) : (
                  unifiedItems.map((item) => {
                    if (item.type === "report") {
                      const report = item.data
                      return (
                        <tr 
                          key={`report-${report.id}`} 
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => openReportViewer(report)}
                        >
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                              <span className="text-sm font-medium text-gray-900">
                                {report.data?.reportName || "Untitled Report"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              Report
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {report.data?.sliceName ? (
                              <span>{report.data.sliceName}</span>
                            ) : (
                              <span className="text-gray-400">
                                Period: {report.periodKey}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {format(new Date(report.generatedAt), "MMM d, yyyy")}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {report.source === "manual" || !report.taskInstance ? (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                Manual
                              </span>
                            ) : (
                              <span onClick={(e) => e.stopPropagation()}>
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
                          <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
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
                      )
                    } else {
                      // Reconciliation run
                      const run = item.data
                      return (
                        <tr 
                          key={`recon-${run.id}`} 
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => { setViewingRecon(run); setReconViewerOpen(true) }}
                        >
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <Scale className="w-4 h-4 text-purple-500 flex-shrink-0" />
                              <span className="text-sm font-medium text-gray-900">
                                {run.config.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                              Reconciliation
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            <div className="flex items-center gap-3">
                              <span className="text-green-600 font-medium">{run.matchedCount} matched</span>
                              {run.exceptionCount > 0 && (
                                <span className="text-amber-600">{run.exceptionCount} exceptions</span>
                              )}
                              <span className={`font-medium ${run.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                                ${Math.abs(run.variance).toFixed(2)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {format(new Date(run.completedAt || run.createdAt), "MMM d, yyyy")}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            <span onClick={(e) => e.stopPropagation()}>
                              {run.taskInstance ? (
                              <Link
                                href={`/dashboard/jobs/${run.taskInstance.id}?tab=reconciliation`}
                                className="flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                {run.taskInstance.name}
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                              ) : (
                                <span className="text-gray-400 text-xs">No task linked</span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="View Details"
                                onClick={() => { setViewingRecon(run); setReconViewerOpen(true) }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    }
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

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
          <div className="flex-1 overflow-hidden mt-4">
            {!viewingReport?.data?.table || !viewingReport.data.table.columns?.length || !viewingReport.data.table.rows ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No data available</p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 overflow-auto h-full">
                <table className="text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                  <thead className="bg-gray-100 sticky top-0 z-20">
                    <tr className="border-b-2 border-gray-200">
                      {viewingReport.data.table.columns.map((col, colIndex) => {
                        const isLabelColumn = col.key === "_label"
                        return (
                          <th
                            key={col.key}
                            className={`px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider ${
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
                            {col.label}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {viewingReport.data.table.rows.map((row, rowIndex) => {
                      const rowType = row._type as string | undefined
                      return (
                        <tr 
                          key={`row-${row._label || rowIndex}`} 
                          className="hover:bg-blue-50 transition-colors bg-white"
                        >
                          {viewingReport.data.table!.columns.map((col, colIndex) => {
                            const effectiveFormat = col.key === "_label"
                              ? "text"
                              : ((row._format as string) || col.dataType)
                            const isLabelColumn = col.key === "_label"
                            return (
                              <td 
                                key={col.key} 
                                className={`px-4 py-3 border-b border-gray-100 overflow-hidden text-ellipsis whitespace-nowrap ${
                                  isLabelColumn 
                                    ? "sticky left-0 z-10 bg-white font-medium text-gray-900" 
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
                      )
                    })}
                  </tbody>
                  {viewingReport.data.table?.formulaRows && viewingReport.data.table.formulaRows.length > 0 && (
                    <tfoot className="bg-blue-50 border-t-2 border-blue-200 sticky bottom-0 z-20">
                      {viewingReport.data.table.formulaRows.map((fRow) => (
                        <tr key={fRow.key}>
                          {viewingReport.data.table!.columns.map((col, colIndex) => {
                            const isLabelColumn = colIndex === 0
                            return (
                              <td
                                key={col.key}
                                className={`px-4 py-3 overflow-hidden text-ellipsis whitespace-nowrap ${
                                  isLabelColumn 
                                    ? "sticky left-0 z-10 bg-blue-50 font-medium text-gray-900" 
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
          generatedReportId={viewingReport.id}
        />
      )}

      {/* Reconciliation Summary Modal */}
      <Dialog open={reconViewerOpen} onOpenChange={(open) => !open && setReconViewerOpen(false)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-500" />
              {viewingRecon?.config.name || "Reconciliation"}
            </DialogTitle>
            <DialogDescription>
              {viewingRecon?.taskInstance?.board?.name && (
                <span>{viewingRecon.taskInstance.board.name} &bull; </span>
              )}
              {viewingRecon?.taskInstance?.name || "No task linked"}
            </DialogDescription>
          </DialogHeader>

          {viewingRecon && (
            <div className="space-y-5 py-2">
              {/* Status */}
              <div className="flex items-center gap-2">
                {viewingRecon.status === "COMPLETE" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-green-700 bg-green-50">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Complete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-amber-700 bg-amber-50">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    In Review
                  </span>
                )}
                {viewingRecon.completedAt && (
                  <span className="text-xs text-gray-500">
                    {format(new Date(viewingRecon.completedAt), "MMM d, yyyy h:mm a")}
                  </span>
                )}
                {viewingRecon.completedByUser && (
                  <span className="text-xs text-gray-500">
                    by {viewingRecon.completedByUser.name || viewingRecon.completedByUser.email}
                  </span>
                )}
              </div>

              {/* Source Files */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Source A</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{viewingRecon.sourceAFileName || "—"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{viewingRecon.totalSourceA} rows</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Source B</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{viewingRecon.sourceBFileName || "—"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{viewingRecon.totalSourceB} rows</p>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center bg-green-50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-green-700">{viewingRecon.matchedCount}</p>
                  <p className="text-xs text-green-600 mt-0.5">Matched</p>
                </div>
                <div className="text-center bg-amber-50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-amber-700">{viewingRecon.exceptionCount}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Exceptions</p>
                </div>
                <div className={`text-center rounded-lg p-3 ${viewingRecon.variance === 0 ? "bg-green-50" : "bg-red-50"}`}>
                  <p className={`text-2xl font-semibold ${viewingRecon.variance === 0 ? "text-green-700" : "text-red-700"}`}>
                    ${Math.abs(viewingRecon.variance).toFixed(2)}
                  </p>
                  <p className={`text-xs mt-0.5 ${viewingRecon.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                    Variance
                  </p>
                </div>
              </div>

              {/* Link to full detail */}
              <div className="pt-2 border-t border-gray-200">
                <Link
                  href={viewingRecon.taskInstance ? `/dashboard/jobs/${viewingRecon.taskInstance.id}?tab=reconciliation` : `/dashboard/reconciliations/${viewingRecon.configId}`}
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  onClick={() => setReconViewerOpen(false)}
                >
                  View full reconciliation detail
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
