"use client"

import { useState } from "react"
import Link from "next/link"
import { CampaignType, TaskStatus } from "@prisma/client"

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
}

interface InboxTableProps {
  tasks: Task[]
}

export function InboxTable({ tasks }: InboxTableProps) {
  const [sortField, setSortField] = useState<keyof Task | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const handleSort = (field: keyof Task) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    if (!sortField) return 0

    let aValue: any = a[sortField]
    let bValue: any = b[sortField]

    if (sortField === "entity") {
      aValue = a.entity.firstName || a.entity.email || ""
      bValue = b.entity.firstName || b.entity.email || ""
    } else if (sortField === "createdAt") {
      aValue = new Date(a.createdAt).getTime()
      bValue = new Date(b.createdAt).getTime()
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1
    return 0
  })

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      AWAITING_RESPONSE: "bg-yellow-100 text-yellow-800",
      REPLIED: "bg-blue-100 text-blue-800",
      HAS_ATTACHMENTS: "bg-purple-100 text-purple-800",
      VERIFYING: "bg-indigo-100 text-indigo-800",
      FULFILLED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
      FLAGGED: "bg-orange-100 text-orange-800",
      MANUAL_REVIEW: "bg-gray-100 text-gray-800"
    }
    return colors[status] || "bg-gray-100 text-gray-800"
  }

  const getCampaignTypeColor = (type: string | null) => {
    if (!type) return "bg-gray-100 text-gray-800"
    const colors: Record<string, string> = {
      W9: "bg-blue-100 text-blue-800",
      COI: "bg-green-100 text-green-800",
      EXPENSE: "bg-purple-100 text-purple-800",
      TIMESHEET: "bg-indigo-100 text-indigo-800",
      INVOICE: "bg-yellow-100 text-yellow-800",
      RECEIPT: "bg-pink-100 text-pink-800",
      CUSTOM: "bg-gray-100 text-gray-800"
    }
    return colors[type] || "bg-gray-100 text-gray-800"
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort("entity" as keyof Task)}
            >
              Entity
              {sortField === "entity" && (
                <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              )}
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort("campaignName" as keyof Task)}
            >
              Campaign Name
              {sortField === "campaignName" && (
                <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              )}
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              Campaign Type
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort("status" as keyof Task)}
            >
              Status
              {sortField === "status" && (
                <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              )}
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort("createdAt" as keyof Task)}
            >
              Created
              {sortField === "createdAt" && (
                <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
              )}
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedTasks.map((task) => (
            <tr
              key={task.id}
              className="hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <Link href={`/dashboard/inbox/${task.id}`} className="block">
                  <div className="text-sm font-medium text-gray-900">
                    {task.entity.firstName || "Unknown"}
                  </div>
                  <div className="text-sm text-gray-500">
                    {task.entity.email || "No email"}
                  </div>
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Link href={`/dashboard/inbox/${task.id}`} className="block">
                  <div className="text-sm text-gray-900">
                    {task.campaignName || "—"}
                  </div>
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Link href={`/dashboard/inbox/${task.id}`} className="block">
                  {task.campaignType ? (
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getCampaignTypeColor(task.campaignType)}`}>
                      {task.campaignType}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">—</span>
                  )}
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Link href={`/dashboard/inbox/${task.id}`} className="block">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(task.status)}`}>
                    {task.status.replace(/_/g, " ")}
                  </span>
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <Link href={`/dashboard/inbox/${task.id}`} className="block">
                  {formatDate(task.createdAt)}
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <Link
                  href={`/dashboard/inbox/${task.id}`}
                  className="text-indigo-600 hover:text-indigo-900"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
          {sortedTasks.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                No inbox items found. Compose an email to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}














