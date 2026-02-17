"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2 } from "lucide-react"
import type { WorkflowAuditLogEntry } from "@/lib/automations/types"

interface ActivityLogTabProps {
  ruleId: string
}

const ACTION_LABELS: Record<string, string> = {
  workflow_started: "Workflow started",
  workflow_completed: "Workflow completed",
  workflow_failed: "Workflow failed",
  workflow_cancelled: "Workflow cancelled",
  action_executed: "Action executed",
  condition_evaluated: "Condition evaluated",
  approval_requested: "Approval requested",
  approval_granted: "Approval granted",
  approval_rejected: "Approval rejected",
  approval_timeout: "Approval timed out",
  step_failed: "Step failed",
  step_skipped: "Step skipped",
}

const OUTCOME_COLORS: Record<string, string> = {
  success: "text-green-600",
  failed: "text-red-600",
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function ActivityLogTab({ ruleId }: ActivityLogTabProps) {
  const [logs, setLogs] = useState<WorkflowAuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    try {
      // Fetch recent runs with their audit logs
      const runsRes = await fetch(`/api/workflow-runs?ruleId=${ruleId}&limit=10`)
      if (!runsRes.ok) return

      const runsData = await runsRes.json()
      const runIds = (runsData.runs || []).map((r: any) => r.id)

      // Fetch audit logs for each run
      const allLogs: WorkflowAuditLogEntry[] = []
      for (const runId of runIds.slice(0, 5)) {
        const runRes = await fetch(`/api/workflow-runs/${runId}`)
        if (runRes.ok) {
          const runData = await runRes.json()
          if (runData.run?.auditLogs) {
            allLogs.push(...runData.run.auditLogs)
          }
        }
      }

      // Sort by date descending
      allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setLogs(allLogs)
    } catch {
      // Handle error
    } finally {
      setLoading(false)
    }
  }, [ruleId])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-12">
        No activity yet. Run this automation to see the activity log.
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-500 font-medium">
            <th className="text-left py-2.5 px-3">Time</th>
            <th className="text-left py-2.5 px-3">Action</th>
            <th className="text-left py-2.5 px-3 hidden sm:table-cell">Step</th>
            <th className="text-left py-2.5 px-3 hidden md:table-cell">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-gray-50 last:border-0">
              <td className="py-2 px-3 text-xs text-gray-500">
                {formatDate(log.createdAt)}
              </td>
              <td className="py-2 px-3 text-sm text-gray-700">
                {ACTION_LABELS[log.actionType] || log.actionType}
              </td>
              <td className="py-2 px-3 text-xs text-gray-500 hidden sm:table-cell">
                {log.stepId || "—"}
              </td>
              <td className="py-2 px-3 hidden md:table-cell">
                {log.outcome && (
                  <span className={`text-xs font-medium ${OUTCOME_COLORS[log.outcome] || "text-gray-500"}`}>
                    {log.outcome}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
