"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, FileText, Search, MoreHorizontal, Trash2, Database, LayoutGrid, Table2, Calendar, Filter, Download, Eye, Clock } from "lucide-react"
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

const CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
}

export default function ReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

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

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

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
              <p className="text-sm text-gray-500">Reports automatically produced during accounting periods</p>
            </div>
            <div className="flex items-center gap-2">
              <Select defaultValue="all">
                <SelectTrigger className="w-[160px] h-9">
                  <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-[160px] h-9">
                  <Filter className="w-4 h-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Templates</SelectItem>
                </SelectContent>
              </Select>
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
                    Slice
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
                {/* Empty state row */}
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Clock className="mx-auto h-8 w-8 text-gray-300" />
                    <p className="mt-2 text-sm text-gray-500">No generated reports yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Reports will appear here when tasks with report slices complete during accounting periods
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
