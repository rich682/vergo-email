"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import Link from "next/link"

interface TasksData {
  items: any[]
  total: number
  page: number
  totalPages: number
}

export default function TasksPage() {
  const [data, setData] = useState<TasksData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set("page", page.toString())
      params.set("limit", "50")
      const response = await fetch(`/api/tasks?${params}`)
      if (response.ok) {
        const json = await response.json()
        // Handle both paginated response and legacy array response
        if (Array.isArray(json)) {
          setData({ items: json, total: json.length, page: 1, totalPages: 1 })
        } else {
          setData(json)
        }
      }
    } catch (error) {
      console.error("Error fetching tasks:", error)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    setLoading(true)
    fetchTasks()
    const interval = setInterval(fetchTasks, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [fetchTasks])

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      AWAITING_RESPONSE: "bg-yellow-100 text-yellow-800",
      REPLIED: "bg-blue-100 text-blue-800",
      HAS_ATTACHMENTS: "bg-purple-100 text-purple-800",
      FULFILLED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
      FLAGGED: "bg-orange-100 text-orange-800"
    }
    return colors[status] || "bg-gray-100 text-gray-800"
  }

  const tasks = data?.items || []

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tasks</h2>
          <p className="text-gray-600">
            Track email responses and submissions
            {data && data.total > 0 && (
              <span className="ml-2 text-sm text-gray-400">({data.total} total)</span>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => (
          <Link key={task.id} href={`/dashboard/tasks/${task.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{task.entity?.name || task.entity?.email}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      {task.campaign?.name || "No campaign"}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                    {task.status.replace(/_/g, " ")}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Created: {new Date(task.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}

        {tasks.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No tasks yet. Compose an email to get started.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
            aria-label="Next page"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
