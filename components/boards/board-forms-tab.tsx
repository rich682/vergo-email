"use client"

import { useState, useEffect, useCallback } from "react"
import { ClipboardList, Loader2, Clock, ExternalLink } from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"

interface FormTaskSummary {
  taskInstanceId: string
  formDefinitionId: string
  taskName: string
  formName: string
  total: number
  submitted: number
  pending: number
  expired: number
  latestSentAt: string | null
  taskInstance: {
    id: string
    name: string
    board: { id: string; name: string } | null
  } | null
}

interface BoardFormsTabProps {
  boardId: string
}

export function BoardFormsTab({ boardId }: BoardFormsTabProps) {
  const [formTasks, setFormTasks] = useState<FormTaskSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFormTasks = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/form-requests/tasks?boardId=${boardId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setFormTasks(data.tasks || [])
      }
    } catch (error) {
      console.error("Error fetching board form tasks:", error)
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    fetchFormTasks()
  }, [fetchFormTasks])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (formTasks.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">No form responses for this board yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Send form requests from tasks in this board to start collecting data
        </p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Form</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date Sent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {formTasks.map((item) => {
            const pct = item.total > 0 ? Math.round((item.submitted / item.total) * 100) : 0
            return (
              <tr
                key={`${item.taskInstanceId}-${item.formDefinitionId}`}
                className="hover:bg-gray-50"
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{item.formName}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-gray-600">
                  {item.taskInstance ? (
                    <Link
                      href={`/dashboard/jobs/${item.taskInstance.id}`}
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      {item.taskName}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  ) : (
                    <span className="text-gray-500">{item.taskName}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 max-w-[120px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {item.submitted}/{item.total}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-gray-500">
                  {item.latestSentAt
                    ? format(new Date(item.latestSentAt), "MMM d, yyyy")
                    : "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
