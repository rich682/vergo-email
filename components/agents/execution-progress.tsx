"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, XCircle, CheckCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ExecutionProgressProps {
  agentId: string
  executionId: string
  onComplete?: () => void
  onCancel?: () => void
}

interface ExecutionStatus {
  id: string
  status: string
  cancelled: boolean
  totalSteps: number
  currentStep: {
    stepNumber: number
    action: string
    reasoning: string
    status: string
  } | null
  estimatedCostUsd: number | null
  completedAt: string | null
}

const STATUS_DISPLAY = {
  running: { icon: Loader2, color: "text-orange-500", label: "Running", animate: true },
  completed: { icon: CheckCircle, color: "text-emerald-500", label: "Completed", animate: false },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed", animate: false },
  needs_review: { icon: AlertTriangle, color: "text-amber-500", label: "Needs Review", animate: false },
  cancelled: { icon: XCircle, color: "text-gray-400", label: "Cancelled", animate: false },
}

export function ExecutionProgress({ agentId, executionId, onComplete, onCancel }: ExecutionProgressProps) {
  const [status, setStatus] = useState<ExecutionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/executions/${executionId}/status`)
      if (!res.ok) throw new Error("Failed to fetch status")
      const data = await res.json()
      setStatus(data.status)

      // Check if execution has finished
      if (data.status.status !== "running") {
        onComplete?.()
      }
    } catch (err) {
      setError("Failed to load execution status")
    }
  }, [agentId, executionId, onComplete])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleCancel = async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/executions/${executionId}/cancel`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to cancel")
      onCancel?.()
    } catch {
      setError("Failed to cancel execution")
    }
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>
    )
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 p-4">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    )
  }

  const statusConfig = STATUS_DISPLAY[status.status as keyof typeof STATUS_DISPLAY] || STATUS_DISPLAY.running
  const StatusIcon = statusConfig.icon

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-5 h-5 ${statusConfig.color} ${statusConfig.animate ? "animate-spin" : ""}`} />
          <span className="text-sm font-medium text-gray-900">{statusConfig.label}</span>
          <span className="text-xs text-gray-400">Step {status.totalSteps}/10</span>
        </div>
        {status.status === "running" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            className="text-xs h-7"
          >
            Cancel
          </Button>
        )}
      </div>

      {status.currentStep && (
        <div className="mt-3 pl-7">
          <p className="text-xs text-gray-600">{status.currentStep.reasoning}</p>
          {status.currentStep.action && (
            <p className="text-xs text-gray-400 mt-1">Action: {status.currentStep.action}</p>
          )}
        </div>
      )}

      {/* Progress bar */}
      {status.status === "running" && (
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min((status.totalSteps / 10) * 100, 100)}%` }}
          />
        </div>
      )}

      {status.estimatedCostUsd !== null && status.estimatedCostUsd !== undefined && (
        <p className="text-[11px] text-gray-400 mt-2">
          Cost: ${status.estimatedCostUsd.toFixed(4)}
        </p>
      )}
    </div>
  )
}
