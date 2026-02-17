"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { WorkflowRunStatusBadge } from "../shared/workflow-run-status-badge"
import type { WorkflowRunListItem } from "@/lib/automations/types"

interface RunsTabProps {
  ruleId: string
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "RUNNING", label: "Running" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: "WAITING_APPROVAL", label: "Pending Approval" },
  { value: "CANCELLED", label: "Cancelled" },
]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "—"
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const diffSec = Math.floor((e - s) / 1000)
  if (diffSec < 60) return `${diffSec}s`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  return `${Math.floor(diffSec / 3600)}h ${Math.floor((diffSec % 3600) / 60)}m`
}

export function RunsTab({ ruleId }: RunsTabProps) {
  const router = useRouter()
  const [runs, setRuns] = useState<WorkflowRunListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [offset, setOffset] = useState(0)
  const limit = 20

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        ruleId,
        limit: String(limit),
        offset: String(offset),
      })
      if (statusFilter) params.set("status", statusFilter)

      const res = await fetch(`/api/workflow-runs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRuns(data.runs || [])
        setTotal(data.total || 0)
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false)
    }
  }, [ruleId, statusFilter, offset])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  // Poll for running/waiting runs
  useEffect(() => {
    const hasActiveRun = runs.some((r) => r.status === "RUNNING" || r.status === "PENDING")
    if (!hasActiveRun) return

    const interval = setInterval(fetchRuns, 5000)
    return () => clearInterval(interval)
  }, [runs, fetchRuns])

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === filter.value
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            onClick={() => { setStatusFilter(filter.value); setOffset(0) }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Runs table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-12">
          {statusFilter ? "No runs matching this filter." : "No runs yet. Run this agent to see results here."}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 font-medium">
                <th className="text-left py-2.5 px-3 w-12">#</th>
                <th className="text-left py-2.5 px-3">Date</th>
                <th className="text-left py-2.5 px-3">Status</th>
                <th className="text-left py-2.5 px-3 hidden sm:table-cell">Duration</th>
                <th className="text-left py-2.5 px-3 hidden md:table-cell">Steps</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, index) => (
                <tr
                  key={run.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/dashboard/automations/${ruleId}/runs/${run.id}`)}
                >
                  <td className="py-2.5 px-3 text-xs text-gray-400">
                    {total - offset - index}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-gray-700">
                    {formatDate(run.createdAt)}
                  </td>
                  <td className="py-2.5 px-3">
                    <WorkflowRunStatusBadge status={run.status} size="sm" />
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-500 hidden sm:table-cell">
                    {formatDuration(run.startedAt, run.completedAt)}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-500 hidden md:table-cell">
                    {run.stepResults?.length || 0} completed
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-50"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </button>
            <button
              className="px-3 py-1 rounded border border-gray-200 text-gray-600 disabled:opacity-50"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
