"use client"

import { useState, useEffect, useCallback } from "react"
import { Scale, Loader2, Clock, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"

interface CompletedReconRun {
  id: string
  configId: string
  boardId: string | null
  taskInstanceId: string | null
  status: "COMPLETE" | "REVIEW"
  matchedCount: number
  exceptionCount: number
  variance: number
  completedAt: string | null
  createdAt: string
  config: {
    id: string
    name: string
  }
  taskInstance: {
    id: string
    name: string
    board: { id: string; name: string } | null
  } | null
}

interface BoardReconciliationsTabProps {
  boardId: string
}

export function BoardReconciliationsTab({ boardId }: BoardReconciliationsTabProps) {
  const [runs, setRuns] = useState<CompletedReconRun[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/reconciliations/completed?boardId=${boardId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setRuns(data.runs || [])
      }
    } catch (error) {
      console.error("Error fetching board reconciliations:", error)
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">No reconciliations for this board yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Run reconciliations from tasks in this board to see results here
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
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-gray-50">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900">{run.config.name}</span>
                </div>
              </td>
              <td className="px-4 py-2">
                {run.status === "COMPLETE" ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium inline-flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Complete
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    In Review
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">
                <div className="flex items-center gap-3">
                  <span className="text-green-600 font-medium">{run.matchedCount} matched</span>
                  {run.exceptionCount > 0 && (
                    <span className="text-amber-600">{run.exceptionCount} exceptions</span>
                  )}
                  <span className={`font-medium ${run.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                    ${Math.abs(run.variance).toFixed(2)}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2 text-sm text-gray-500">
                {format(new Date(run.completedAt || run.createdAt), "MMM d, yyyy")}
              </td>
              <td className="px-4 py-2 text-sm text-gray-600">
                {run.taskInstance ? (
                  <Link
                    href={`/dashboard/jobs/${run.taskInstance.id}?tab=reconciliation`}
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    {run.taskInstance.name}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                ) : (
                  <span className="text-gray-400 text-xs">No task linked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
