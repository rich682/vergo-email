"use client"

import { StepCard } from "../steps/step-card"
import { StepTypeSelector } from "../steps/step-type-selector"
import { ActionSendRequestConfig } from "../steps/action-send-request-config"
import { ActionSendFormConfig } from "../steps/action-send-form-config"
import { ActionCompleteReconConfig } from "../steps/action-complete-recon-config"
import { ActionCompleteReportConfig } from "../steps/action-complete-report-config"
import { AgentRunConfig } from "../steps/agent-run-config"
import { HumanApprovalConfig } from "../steps/human-approval-config"
import { ConditionConfig } from "../steps/condition-config"
import type { WorkflowStep } from "@/lib/workflows/types"

interface WorkflowBuilderStepProps {
  steps: WorkflowStep[]
  onStepsChange: (steps: WorkflowStep[]) => void
}

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function WorkflowBuilderStep({ steps, onStepsChange }: WorkflowBuilderStepProps) {
  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    const newSteps = [...steps]
    newSteps[index] = { ...newSteps[index], ...updates }
    onStepsChange(newSteps)
  }

  const deleteStep = (index: number) => {
    if (steps.length <= 1) return
    onStepsChange(steps.filter((_, i) => i !== index))
  }

  const addStepAfter = (index: number, type: string, actionType?: string) => {
    const newStep: WorkflowStep = {
      id: generateStepId(),
      type: type as WorkflowStep["type"],
      label: getDefaultLabel(type, actionType),
      ...(actionType ? { actionType: actionType as WorkflowStep["actionType"] } : {}),
      ...(type === "human_approval" ? { timeoutHours: 48, notifyUserIds: [] } : {}),
      onError: "fail",
    }
    const newSteps = [...steps]
    newSteps.splice(index + 1, 0, newStep)
    onStepsChange(newSteps)
  }

  const addStepAtEnd = (type: string, actionType?: string) => {
    addStepAfter(steps.length - 1, type, actionType)
  }

  const stepLabels = steps.map((s) => ({ id: s.id, label: s.label }))

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Configure steps</h2>
      <p className="text-sm text-gray-500 mb-6">
        Define what happens when this automation runs. Steps execute in order from top to bottom.
      </p>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={step.id}>
            <StepCard
              stepNumber={index + 1}
              type={step.type}
              actionType={step.actionType}
              label={step.label}
              onLabelChange={(label) => updateStep(index, { label })}
              errorHandling={step.onError || "fail"}
              onErrorHandlingChange={(onError) => updateStep(index, { onError: onError as "skip" | "fail" | "retry" })}
              onDelete={() => deleteStep(index)}
              canDelete={steps.length > 1}
            >
              {renderStepConfig(step, index, updateStep, stepLabels)}
            </StepCard>

            {/* Add step button between steps */}
            {index < steps.length - 1 && (
              <div className="py-2 flex justify-center">
                <div className="w-px h-4 bg-gray-200" />
              </div>
            )}
          </div>
        ))}

        {/* Add step button at end */}
        <div className="pt-2">
          <StepTypeSelector onSelect={(type, actionType) => addStepAtEnd(type, actionType)} />
        </div>
      </div>
    </div>
  )
}

function getDefaultLabel(type: string, actionType?: string): string {
  const labels: Record<string, string> = {
    send_request: "Send requests",
    send_form: "Send forms",
    complete_reconciliation: "Complete reconciliation",
    complete_report: "Generate report",
    agent_run: "Run AI agent",
    human_approval: "Require approval",
    condition: "Check condition",
  }
  return labels[actionType || type] || "New step"
}

function renderStepConfig(
  step: WorkflowStep,
  index: number,
  updateStep: (index: number, updates: Partial<WorkflowStep>) => void,
  stepLabels: { id: string; label: string }[]
) {
  switch (step.type) {
    case "action":
      switch (step.actionType) {
        case "send_request":
          return (
            <ActionSendRequestConfig
              params={step.actionParams || {}}
              onChange={(params) => updateStep(index, { actionParams: params })}
            />
          )
        case "send_form":
          return (
            <ActionSendFormConfig
              params={step.actionParams || {}}
              onChange={(params) => updateStep(index, { actionParams: params })}
            />
          )
        case "complete_reconciliation":
          return (
            <ActionCompleteReconConfig
              params={step.actionParams || {}}
              onChange={(params) => updateStep(index, { actionParams: params })}
            />
          )
        case "complete_report":
          return (
            <ActionCompleteReportConfig
              params={step.actionParams || {}}
              onChange={(params) => updateStep(index, { actionParams: params })}
            />
          )
        default:
          return <p className="text-xs text-gray-400">Unknown action type.</p>
      }

    case "agent_run":
      return (
        <AgentRunConfig
          agentDefinitionId={step.agentDefinitionId}
          onAgentChange={(id) => updateStep(index, { agentDefinitionId: id })}
        />
      )

    case "human_approval":
      return (
        <HumanApprovalConfig
          approvalMessage={step.approvalMessage}
          notifyUserIds={step.notifyUserIds || []}
          timeoutHours={step.timeoutHours || 48}
          onMessageChange={(msg) => updateStep(index, { approvalMessage: msg })}
          onUserIdsChange={(ids) => updateStep(index, { notifyUserIds: ids })}
          onTimeoutChange={(hours) => updateStep(index, { timeoutHours: hours })}
        />
      )

    case "condition":
      return (
        <ConditionConfig
          condition={step.condition}
          onTrue={step.onTrue}
          onFalse={step.onFalse}
          onChange={(updates) => updateStep(index, updates)}
          stepLabels={stepLabels.filter((s) => s.id !== step.id)}
        />
      )

    default:
      return <p className="text-xs text-gray-400">Unknown step type.</p>
  }
}
