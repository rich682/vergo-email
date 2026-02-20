"use client"

import { useState, useEffect, useCallback } from "react"
import { FileText, Loader2, Download, Clock, ExternalLink } from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface GeneratedReport {
  id: string
  periodKey: string
  source?: "task" | "manual"
  generatedAt: string
  data: {
    reportName: string
    sliceName?: string
  }
  reportDefinition?: {
    id: string
    name: string
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

interface BoardReportsTabProps {
  boardId: string
}

export function BoardReportsTab({ boardId }: BoardReportsTabProps) {
  const [reports, setReports] = useState<GeneratedReport[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/generated-reports?boardId=${boardId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
      }
    } catch (error) {
      console.error("Error fetching board reports:", error)
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleDownload = async (reportId: string) => {
    try {
      const response = await fetch(`/api/generated-reports/${reportId}/export`, {
        credentials: "include",
      })
      if (!response.ok) throw new Error("Export failed")

      const contentDisposition = response.headers.get("Content-Disposition")
      let filename = "report.xlsx"
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }

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
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">No reports generated for this board yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Reports will appear here when generated from tasks in this board
        </p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {reports.map((report) => (
            <tr key={report.id} className="hover:bg-gray-50">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900">
                    {report.data?.reportName || "Untitled Report"}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">
                {report.periodKey}
              </td>
              <td className="px-4 py-2 text-sm text-gray-500">
                {format(new Date(report.generatedAt), "MMM d, yyyy")}
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">
                {report.taskInstance ? (
                  <Link
                    href={`/dashboard/jobs/${report.taskInstance.id}`}
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    {report.taskInstance.name}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                ) : (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                    Manual
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  title="Download Excel"
                  onClick={() => handleDownload(report.id)}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
