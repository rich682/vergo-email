"use client"

import { useMemo } from "react"
import { Scale, Clock, ExternalLink, User } from "lucide-react"
import Link from "next/link"

interface BoardTask {
  id: string
  name: string
  status: string
  dueDate: string | null
  taskType?: string | null
  owner: { id: string; name: string | null; email: string }
}

interface BoardReconciliationsTabProps {
  boardId: string
  tasks: BoardTask[]
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  IN_PROGRESS: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  COMPLETE: { bg: "bg-green-100", text: "text-green-700", label: "Complete" },
  PENDING: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending" },
  REVIEW: { bg: "bg-amber-100", text: "text-amber-700", label: "Review" },
  BLOCKED: { bg: "bg-red-100", text: "text-red-700", label: "Blocked" },
}

export function BoardReconciliationsTab({ boardId, tasks }: BoardReconciliationsTabProps) {
  const reconTasks = useMemo(
    () => tasks.filter((t) => t.taskType === "reconciliation"),
    [tasks]
  )

  if (reconTasks.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">No reconciliation tasks in this board</p>
        <p className="text-xs text-gray-400 mt-1">
          Create a task with type &ldquo;Reconciliation&rdquo; to see it here
        </p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {reconTasks.map((task) => {
            const style = STATUS_STYLES[task.status] || STATUS_STYLES.PENDING
            return (
              <tr key={task.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/dashboard/jobs/${task.id}`}
                    className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-blue-600"
                  >
                    <Scale className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    {task.name}
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    {task.owner.name || task.owner.email}
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-gray-500">
                  {task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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
