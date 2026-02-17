"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock, SkipForward } from "lucide-react"
import { StepTypeIcon, StepTypeLabel } from "../shared/step-type-icon"
import type { StepResult } from "@/lib/workflows/types"

interface RunTimelineProps {
  stepResults: StepResult[]
  currentStepId: string | null
  status: string
}

const OUTCOME_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  success: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", label: "Success" },
  failed: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Failed" },
  skipped: { icon: SkipForward, color: "text-gray-400", bg: "bg-gray-50", label: "Skipped" },
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function RunTimeline({ stepResults, currentStepId, status }: RunTimelineProps) {
  if (stepResults.length === 0 && status === "PENDING") {
    return (
      <div className="text-sm text-gray-500 text-center py-8">
        Workflow is pending. Steps will appear here once execution starts.
      </div>
    )
  }

  if (stepResults.length === 0 && status === "RUNNING") {
    return (
      <div className="text-sm text-gray-500 text-center py-8">
        <Clock className="w-5 h-5 mx-auto mb-2 text-blue-500 animate-pulse" />
        Workflow is running...
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {stepResults.map((result, index) => (
        <StepResultCard
          key={result.stepId}
          result={result}
          index={index}
          isLast={index === stepResults.length - 1}
          isCurrent={result.stepId === currentStepId}
        />
      ))}
    </div>
  )
}

function StepResultCard({
  result,
  index,
  isLast,
  isCurrent,
}: {
  result: StepResult
  index: number
  isLast: boolean
  isCurrent: boolean
}) {
  const [expanded, setExpanded] = useState(result.outcome === "failed")
  const config = OUTCOME_CONFIG[result.outcome] || OUTCOME_CONFIG.success
  const OutcomeIcon = config.icon

  return (
    <div className="flex items-start gap-3">
      {/* Connector */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${config.bg}`}>
          <OutcomeIcon className={`w-3.5 h-3.5 ${config.color}`} />
        </div>
        {!isLast && <div className="w-px h-full min-h-[2rem] bg-gray-200" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 min-w-0 ${isLast ? "" : ""}`}>
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          )}
          <StepTypeIcon type={result.type} size="sm" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-900">{result.stepLabel}</span>
            <span className="text-[10px] text-gray-400 ml-2">
              <StepTypeLabel type={result.type} />
            </span>
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
            {config.label}
          </span>
          <span className="text-[10px] text-gray-400">
            {formatTime(result.completedAt)}
          </span>
        </button>

        {expanded && (
          <div className="mt-2 ml-6 space-y-2">
            {result.error && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {result.error}
              </div>
            )}
            {result.data && Object.keys(result.data).length > 0 && (
              <div className="p-2 bg-gray-50 border border-gray-200 rounded">
                <pre className="text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
