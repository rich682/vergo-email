"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TemplateSelectionStep } from "@/components/automations/wizard/template-selection-step"
import { TaskLinkageStep } from "@/components/automations/wizard/task-linkage-step"
import { TriggerConfigurationStep } from "@/components/automations/wizard/trigger-configuration-step"
import { ConfigurationStep } from "@/components/automations/wizard/configuration-step"
import { ConfirmationStep } from "@/components/automations/wizard/confirmation-step"
import { getTemplate } from "@/lib/automations/templates"
import type { AutomationTemplate, TriggerType, WorkflowStep } from "@/lib/automations/types"

const WIZARD_STEPS = [
  { label: "Template", description: "Choose a starting point" },
  { label: "Task", description: "Link to a recurring task" },
  { label: "Trigger", description: "Configure when to run" },
  { label: "Configuration", description: "Configure automation" },
  { label: "Confirmation", description: "Review and create" },
]

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export default function NewAutomationPage() {
  const router = useRouter()

  const [currentStep, setCurrentStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 0: Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // Step 1: Task Linkage
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedLineageId, setSelectedLineageId] = useState<string | null>(null)
  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null)
  const [selectedTaskName, setSelectedTaskName] = useState<string | null>(null)

  // Step 2: Trigger
  const [name, setName] = useState("")
  const [triggerType, setTriggerType] = useState<TriggerType>("board_created")
  const [conditions, setConditions] = useState<Record<string, unknown>>({})

  // Step 3: Configuration
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({})

  const handleTemplateSelect = (template: AutomationTemplate) => {
    setSelectedTemplateId(template.id)
    setName(template.id === "custom" ? "" : template.name)
    setTriggerType(template.triggerType)
    setConditions(template.defaultConditions)
    // Reset task linkage when template changes
    setSelectedTaskId(null)
    setSelectedLineageId(null)
    setSelectedTaskType(null)
    setSelectedTaskName(null)
    setConfiguration({})
  }

  const handleTaskSelect = (
    taskId: string,
    lineageId: string | null,
    taskType: string | null,
    taskName: string
  ) => {
    setSelectedTaskId(taskId)
    setSelectedLineageId(lineageId)
    setSelectedTaskType(taskType)
    setSelectedTaskName(taskName)
    // Auto-generate name from task if not custom
    if (!name || name === getTemplate(selectedTemplateId || "")?.name) {
      setName(`${taskName} Agent`)
    }
    // Reset configuration so it re-fetches from the new task
    setConfiguration({})
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0: return selectedTemplateId !== null
      case 1: return selectedTaskId !== null
      case 2: return name.trim().length > 0
      case 3: return true
      case 4: return true
      default: return false
    }
  }

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    setError(null)

    try {
      const actions = buildActionsFromConfiguration(
        selectedTemplateId,
        configuration,
        selectedLineageId
      )

      const res = await fetch("/api/automation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trigger: triggerType,
          conditions,
          actions,
          lineageId: selectedLineageId,
          taskType: selectedTaskType,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create agent")
      }

      const data = await res.json()
      router.push(`/dashboard/automations/${data.rule.id}`)
    } catch (err: any) {
      setError(err.message || "Something went wrong")
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-gray-400"
            onClick={() => router.push("/dashboard/automations")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">New Agent</h1>
            <p className="text-sm text-gray-500">
              {WIZARD_STEPS[currentStep].description}
            </p>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Sidebar progress */}
          <div className="hidden md:block w-48 flex-shrink-0">
            <nav className="space-y-1">
              {WIZARD_STEPS.map((ws, index) => {
                const isComplete = index < currentStep
                const isCurrent = index === currentStep
                return (
                  <div
                    key={ws.label}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                      isCurrent
                        ? "bg-orange-50 text-orange-700 font-medium"
                        : isComplete
                          ? "text-gray-600"
                          : "text-gray-400"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                        isCurrent
                          ? "bg-orange-500 text-white"
                          : isComplete
                            ? "bg-green-500 text-white"
                            : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {isComplete ? <Check className="w-3 h-3" /> : index + 1}
                    </span>
                    {ws.label}
                  </div>
                )
              })}
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {/* Step 0: Template */}
              {currentStep === 0 && (
                <TemplateSelectionStep
                  selectedId={selectedTemplateId}
                  onSelect={handleTemplateSelect}
                />
              )}

              {/* Step 1: Task Linkage */}
              {currentStep === 1 && (
                <TaskLinkageStep
                  selectedTemplateId={selectedTemplateId}
                  selectedTaskId={selectedTaskId}
                  onTaskSelect={handleTaskSelect}
                />
              )}

              {/* Step 2: Trigger */}
              {currentStep === 2 && (
                <TriggerConfigurationStep
                  name={name}
                  onNameChange={setName}
                  triggerType={triggerType}
                  onTriggerTypeChange={setTriggerType}
                  conditions={conditions}
                  onConditionsChange={setConditions}
                  templateId={selectedTemplateId}
                />
              )}

              {/* Step 3: Configuration */}
              {currentStep === 3 && (
                <ConfigurationStep
                  templateId={selectedTemplateId!}
                  selectedTaskId={selectedTaskId}
                  configuration={configuration}
                  onConfigurationChange={setConfiguration}
                />
              )}

              {/* Step 4: Confirmation */}
              {currentStep === 4 && (
                <ConfirmationStep
                  name={name}
                  linkedTaskName={selectedTaskName}
                  linkedTaskType={selectedTaskType}
                  triggerType={triggerType}
                  conditions={conditions}
                  configuration={configuration}
                  templateId={selectedTemplateId!}
                />
              )}

              {/* Error */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-100">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                >
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  {/* Mobile step indicator */}
                  <span className="text-xs text-gray-400 md:hidden">
                    Step {currentStep + 1} of {WIZARD_STEPS.length}
                  </span>
                  {currentStep < WIZARD_STEPS.length - 1 ? (
                    <Button
                      onClick={handleNext}
                      disabled={!canProceed()}
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button
                      onClick={handleCreate}
                      disabled={!canProceed() || creating}
                    >
                      {creating && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                      Create Agent
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helper: Build WorkflowDefinition from configuration ─────────────────────

function buildActionsFromConfiguration(
  templateId: string | null,
  config: Record<string, unknown>,
  lineageId: string | null
) {
  if (templateId === "send-requests") {
    return {
      version: 1,
      steps: [
        {
          id: generateStepId(),
          type: "action",
          label: "Send requests",
          actionType: "send_request",
          actionParams: {
            requestTemplateId: config.requestTemplateId,
            recipientSourceType: "task_history",
            lineageId,
            deadlineDate: config.deadlineDate,
            remindersConfig: config.remindersConfig,
          },
          onError: "fail",
        },
      ],
    }
  }

  if (templateId === "send-forms") {
    return {
      version: 1,
      steps: [
        {
          id: generateStepId(),
          type: "action",
          label: "Send forms",
          actionType: "send_form",
          actionParams: {
            formTemplateId: config.formTemplateId,
            recipientSourceType: "task_history",
            lineageId,
            deadlineDate: config.deadlineDate,
            remindersConfig: config.remindersConfig,
          },
          onError: "fail",
        },
      ],
    }
  }

  if (templateId === "run-reconciliation") {
    return {
      version: 1,
      steps: [
        {
          id: generateStepId(),
          type: "action",
          label: "Run reconciliation agent",
          actionType: "complete_reconciliation",
          actionParams: {
            reconciliationConfigId: config.reconciliationConfigId,
          },
          onError: "fail",
        },
      ],
    }
  }

  if (templateId === "generate-report") {
    return {
      version: 1,
      steps: [
        {
          id: generateStepId(),
          type: "action",
          label: "Generate report",
          actionType: "complete_report",
          actionParams: {
            reportDefinitionId: config.reportDefinitionId,
            filterBindings: config.reportFilterBindings,
          },
          onError: "fail",
        },
      ],
    }
  }

  // Custom: use the workflow steps stored in configuration
  if (templateId === "custom" && Array.isArray(config.steps)) {
    return {
      version: 1,
      steps: config.steps,
    }
  }

  // Fallback
  return { version: 1, steps: [] }
}
