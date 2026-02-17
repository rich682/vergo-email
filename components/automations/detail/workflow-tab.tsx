"use client"

import { StepTypeIcon, StepTypeLabel } from "../shared/step-type-icon"
import { TriggerIcon, TriggerDescriptionText } from "../shared/trigger-description"
import type { WorkflowStep } from "@/lib/workflows/types"

interface WorkflowTabProps {
  trigger: string
  conditions: Record<string, unknown>
  steps: WorkflowStep[]
  onEdit?: () => void
  canManage: boolean
}

export function WorkflowTab({ trigger, conditions, steps, onEdit, canManage }: WorkflowTabProps) {
  return (
    <div className="space-y-6">
      {/* Trigger summary */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Trigger</h3>
        <div className="flex items-center gap-2">
          <TriggerIcon trigger={trigger} size="sm" />
          <TriggerDescriptionText trigger={trigger} conditions={conditions} className="text-sm text-gray-700" />
        </div>
      </div>

      {/* Steps timeline */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Workflow Steps ({steps.length})
          </h3>
          {canManage && onEdit && (
            <button
              className="text-xs text-orange-600 hover:text-orange-700 font-medium"
              onClick={onEdit}
            >
              Edit Workflow
            </button>
          )}
        </div>

        <div className="space-y-0">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start gap-3">
              {/* Connector line + number */}
              <div className="flex flex-col items-center">
                <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500 flex-shrink-0">
                  {index + 1}
                </span>
                {index < steps.length - 1 && (
                  <div className="w-px h-8 bg-gray-200" />
                )}
              </div>

              {/* Step content */}
              <div className="flex items-center gap-2.5 pb-4 min-w-0">
                <StepTypeIcon type={step.type} actionType={step.actionType} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{step.label}</p>
                  <p className="text-[11px] text-gray-400">
                    <StepTypeLabel type={step.type} actionType={step.actionType} />
                    {step.onError && step.onError !== "fail" && ` · On error: ${step.onError}`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
