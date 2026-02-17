"use client"

import { TriggerIcon, TriggerDescriptionText } from "../shared/trigger-description"
import { StepTypeIcon, StepTypeLabel } from "../shared/step-type-icon"
import type { TriggerType, WorkflowStep } from "@/lib/workflows/types"

interface ReviewStepProps {
  name: string
  triggerType: TriggerType
  conditions: Record<string, unknown>
  steps: WorkflowStep[]
}

export function ReviewStep({ name, triggerType, conditions, steps }: ReviewStepProps) {
  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Review & create</h2>
      <p className="text-sm text-gray-500 mb-6">
        Review your automation before creating it.
      </p>

      <div className="space-y-4">
        {/* Name */}
        <ReviewSection label="Name">
          <p className="text-sm text-gray-900 font-medium">{name || "Untitled Automation"}</p>
        </ReviewSection>

        {/* Trigger */}
        <ReviewSection label="Trigger">
          <div className="flex items-center gap-2">
            <TriggerIcon trigger={triggerType} size="sm" />
            <TriggerDescriptionText trigger={triggerType} conditions={conditions} className="text-sm text-gray-700" />
          </div>
        </ReviewSection>

        {/* Steps */}
        <ReviewSection label={`Workflow (${steps.length} step${steps.length !== 1 ? "s" : ""})`}>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-4 text-center font-medium">{index + 1}</span>
                <StepTypeIcon type={step.type} actionType={step.actionType} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700">{step.label}</span>
                  <span className="text-[10px] text-gray-400 ml-2">
                    <StepTypeLabel type={step.type} actionType={step.actionType} />
                  </span>
                </div>
                {step.onError && step.onError !== "fail" && (
                  <span className="text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5">
                    On error: {step.onError}
                  </span>
                )}
              </div>
            ))}
          </div>
        </ReviewSection>
      </div>
    </div>
  )
}

function ReviewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</h3>
      {children}
    </div>
  )
}
