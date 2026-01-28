"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, FileText, Search, MoreHorizontal, Trash2, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ReportItem {
  id: string
  name: string
  description: string | null
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
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
              <p className="mt-1 text-sm text-gray-500">
                Create and manage report templates with formulas and aggregations
              </p>
            </div>
            <Link href="/dashboard/reports/new">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Report
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : filteredReports.length === 0 ? (
          /* Empty state */
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {searchQuery ? "No reports found" : "No reports yet"}
            </h3>
            <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Create your first report to define columns, formulas, and aggregations based on your databases."}
            </p>
            {!searchQuery && (
              <div className="mt-6">
                <Link href="/dashboard/reports/new">
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Report
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
      </div>
    </div>
  )
}
