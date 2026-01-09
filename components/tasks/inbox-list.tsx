"use client"

import { useState } from "react"
import { Paperclip, Circle, Check } from "lucide-react"
import { TaskStatus, CampaignType } from "@prisma/client"
import { formatDistanceToNow } from "date-fns"
import { getTaskCompletionState, getStateBadgeColors, TaskCompletionState } from "@/lib/taskState"

interface Task {
  id: string
  entity: {
    firstName: string | null
    email: string | null
  }
  campaignName: string | null
  campaignType: CampaignType | null
  status: TaskStatus
  createdAt: string
  updatedAt: string
  hasAttachments: boolean
  hasReplies: boolean
  replyCount: number
  messageCount: number
  isOpened?: boolean
  openedAt?: string | null
  openedCount?: number
  lastOpenedAt?: string | null
  aiVerified?: boolean | null
  completionState?: TaskCompletionState // Computed state
}

interface InboxListProps {
  tasks: Task[]
  selectedTaskId: string | null
  onTaskSelect: (taskId: string) => void
}

export function InboxList({ tasks, selectedTaskId, onTaskSelect }: InboxListProps) {
  const [sortField, setSortField] = useState<keyof Task | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined
    })
  }

  const getTaskState = (task: Task): TaskCompletionState => {
    if (task.completionState) {
      return task.completionState
    }
    return getTaskCompletionState({
      status: task.status,
      hasAttachments: task.hasAttachments,
      aiVerified: task.aiVerified ?? null,
      updatedAt: task.updatedAt,
      hasReplies: task.hasReplies
    })
  }

  const handleSort = (field: keyof Task) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    if (!sortField) return 0

    let aValue: any = a[sortField]
    let bValue: any = b[sortField]

    if (sortField === "entity") {
      aValue = a.entity.firstName || a.entity.email || ""
      bValue = b.entity.firstName || b.entity.email || ""
    } else if (sortField === "campaignName") {
      aValue = a.campaignName || ""
      bValue = b.campaignName || ""
    } else if (sortField === "updatedAt" || sortField === "createdAt") {
      aValue = new Date(a.updatedAt || a.createdAt).getTime()
      bValue = new Date(b.updatedAt || b.createdAt).getTime()
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1
    return 0
  })

  if (tasks.length === 0) {
    return (
      <div className="border border-gray-200 bg-white shadow-sm">
        <div className="p-8 text-center text-gray-500">
          No inbox items found
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200"
              >
                State
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 border-r border-gray-200"
                onClick={() => handleSort("entity")}
              >
                <div className="flex items-center gap-2">
                  Contact
                  {sortField === "entity" && (
                    <span className="text-gray-400">{sortDirection === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 border-r border-gray-200"
                onClick={() => handleSort("campaignName")}
              >
                <div className="flex items-center gap-2">
                  Request
                  {sortField === "campaignName" && (
                    <span className="text-gray-400">{sortDirection === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("updatedAt")}
              >
                <div className="flex items-center gap-2">
                  Progress
                  {sortField === "updatedAt" && (
                    <span className="text-gray-400">{sortDirection === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedTasks.map((task) => {
              const isSelected = selectedTaskId === task.id
              const senderName = task.entity.firstName || task.entity.email || "Unknown"
              const senderEmail = task.entity.email || ""
              const subject = task.campaignName || "No subject"
              const taskState = getTaskState(task)
              const stateColors = getStateBadgeColors(taskState)
              const isNeedsReview = taskState === "Needs Review"
              
              return (
                <tr
                  key={task.id}
                  onClick={() => onTaskSelect(task.id)}
                  className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                    isSelected ? "bg-blue-50" : ""
                  } ${isNeedsReview ? "border-l-2 border-red-500" : ""}`}
                >
                  <td className="px-4 py-3 whitespace-nowrap border-r border-gray-200">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stateColors.bg} ${stateColors.text}`}>
                      {taskState}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap border-r border-gray-200">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {senderName}
                      </div>
                      {senderEmail && (
                        <div className="text-xs text-gray-500">
                          {senderEmail}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200">
                    {subject}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatRelativeTime(task.updatedAt || task.createdAt)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
