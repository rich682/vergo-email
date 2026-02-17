"use client"

import { useRouter } from "next/navigation"
import { WorkflowRunStatusBadge } from "./shared/workflow-run-status-badge"
import { TriggerBadge } from "./shared/trigger-description"
import type { WorkflowRunListItem } from "@/lib/automations/types"

interface AutomationActivityFeedProps {
  runs: WorkflowRunListItem[]
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHr / 24)

  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function AutomationActivityFeed({ runs }: AutomationActivityFeedProps) {
  const router = useRouter()

  if (runs.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-6">
        No recent activity
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-500 font-medium">
            <th className="text-left py-2 px-3">Agent</th>
            <th className="text-left py-2 px-3">Status</th>
            <th className="text-left py-2 px-3 hidden sm:table-cell">Trigger</th>
            <th className="text-right py-2 px-3">Time</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => router.push(`/dashboard/automations/${run.automationRule.id}/runs/${run.id}`)}
            >
              <td className="py-2 px-3">
                <span className="text-sm text-gray-900 truncate block max-w-[200px]">
                  {run.automationRule.name}
                </span>
              </td>
              <td className="py-2 px-3">
                <WorkflowRunStatusBadge status={run.status} size="sm" />
              </td>
              <td className="py-2 px-3 hidden sm:table-cell">
                <TriggerBadge trigger={run.automationRule.trigger} />
              </td>
              <td className="py-2 px-3 text-right">
                <span className="text-xs text-gray-500">
                  {getRelativeTime(run.createdAt)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
