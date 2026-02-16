"use client"

import { useState } from "react"
import { CheckCircle, XCircle, Loader2, SkipForward, ChevronDown, ChevronRight, Cpu } from "lucide-react"
import type { ExecutionStep } from "@/lib/agents/types"

interface ExecutionTimelineProps {
  steps: ExecutionStep[]
  isRunning?: boolean
}

const STATUS_ICONS = {
  completed: { icon: CheckCircle, color: "text-emerald-500" },
  failed: { icon: XCircle, color: "text-red-500" },
  skipped: { icon: SkipForward, color: "text-gray-400" },
}

export function ExecutionTimeline({ steps, isRunning }: ExecutionTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  const toggleStep = (stepNumber: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepNumber)) next.delete(stepNumber)
      else next.add(stepNumber)
      return next
    })
  }

  if (steps.length === 0 && !isRunning) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No steps recorded yet.
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {steps.map((step) => {
        const statusConfig = STATUS_ICONS[step.status] || STATUS_ICONS.completed
        const StatusIcon = statusConfig.icon
        const isExpanded = expandedSteps.has(step.stepNumber)

        return (
          <div key={step.stepNumber} className="relative">
            {/* Connector line */}
            {step.stepNumber < steps.length && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-gray-200" />
            )}

            <button
              onClick={() => toggleStep(step.stepNumber)}
              className="w-full text-left flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5">
                <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    Step {step.stepNumber}: {step.action}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{step.reasoning}</p>
              </div>
            </button>

            {isExpanded && (
              <div className="ml-8 pl-3 pb-3 border-l-2 border-gray-100 space-y-2">
                {/* Tool details */}
                {step.toolName && (
                  <div className="text-xs">
                    <span className="text-gray-500">Tool: </span>
                    <code className="text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{step.toolName}</code>
                  </div>
                )}

                {/* Tool output */}
                {step.toolOutput != null && (
                  <div className="text-xs bg-gray-50 rounded p-2 max-h-32 overflow-auto">
                    <pre className="text-gray-600 whitespace-pre-wrap break-words">
                      {typeof step.toolOutput === "string"
                        ? step.toolOutput
                        : JSON.stringify(step.toolOutput, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Metadata */}
                <div className="flex items-center gap-3 text-[11px] text-gray-400">
                  {step.model && (
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      {step.model}
                    </span>
                  )}
                  {step.tokensUsed !== undefined && (
                    <span>{step.tokensUsed.toLocaleString()} tokens</span>
                  )}
                  {step.durationMs !== undefined && (
                    <span>{(step.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Running indicator */}
      {isRunning && (
        <div className="flex items-start gap-3 p-2">
          <Loader2 className="w-5 h-5 text-orange-500 animate-spin flex-shrink-0" />
          <span className="text-sm text-gray-500">Agent is thinking...</span>
        </div>
      )}
    </div>
  )
}
