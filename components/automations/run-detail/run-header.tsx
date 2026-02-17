"use client"

import { WorkflowRunStatusBadge } from "../shared/workflow-run-status-badge"
import { TriggerBadge } from "../shared/trigger-description"

interface RunHeaderProps {
  run: {
    id: string
    status: string
    startedAt: string | null
    completedAt: string | null
    failureReason: string | null
    createdAt: string
    automationRule: {
      id: string
      name: string
      trigger: string
    }
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleString()
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—"
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const diffSec = Math.floor((e - s) / 1000)
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`
  return `${Math.floor(diffSec / 3600)}h ${Math.floor((diffSec % 3600) / 60)}m`
}

export function RunHeader({ run }: RunHeaderProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <WorkflowRunStatusBadge status={run.status} />
          <TriggerBadge trigger={run.automationRule.trigger} />
        </div>
        <span className="text-xs text-gray-400 font-mono">{run.id.slice(0, 8)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-gray-500">Started</span>
          <p className="text-gray-700 mt-0.5">{formatDate(run.startedAt)}</p>
        </div>
        <div>
          <span className="text-gray-500">Completed</span>
          <p className="text-gray-700 mt-0.5">{formatDate(run.completedAt)}</p>
        </div>
        <div>
          <span className="text-gray-500">Duration</span>
          <p className="text-gray-700 mt-0.5">{formatDuration(run.startedAt, run.completedAt)}</p>
        </div>
        <div>
          <span className="text-gray-500">Automation</span>
          <p className="text-gray-700 mt-0.5">{run.automationRule.name}</p>
        </div>
      </div>

      {run.failureReason && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {run.failureReason}
        </div>
      )}
    </div>
  )
}
