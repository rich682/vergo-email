"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, ArrowRight, Check, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TriggerConfigurationStep } from "@/components/automations/wizard/trigger-configuration-step"
import { ConfigurationStep } from "@/components/automations/wizard/configuration-step"
import { ConfirmationStep } from "@/components/automations/wizard/confirmation-step"
import { getTemplate } from "@/lib/automations/templates"
import type { TriggerType } from "@/lib/automations/types"

// Task type → automation template mapping
const TASK_TYPE_TEMPLATE_MAP: Record<string, string> = {
  request: "send-standard-request",
  form: "send-form",
  reconciliation: "run-reconciliation",
  report: "run-report",
}

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

interface TaskAgentWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  lineageId: string | null
  taskType: string | null
  taskName: string
  onSuccess: () => void
}

export function TaskAgentWizard({
  open,
  onOpenChange,
  jobId,
  lineageId,
  taskType,
  taskName,
  onSuccess,
}: TaskAgentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-check for request agents: previous period task must exist
  const [checkingPrevious, setCheckingPrevious] = useState(false)
  const [previousPeriodExists, setPreviousPeriodExists] = useState<boolean | null>(null)

  // Auto-select template from task type
  const templateId = taskType ? TASK_TYPE_TEMPLATE_MAP[taskType] : null
  const template = templateId ? getTemplate(templateId) : null

  // Wizard state
  const [name, setName] = useState(`${taskName} Agent`)
  const [triggerType, setTriggerType] = useState<TriggerType>(template?.triggerType || "board_created")
  const [conditions, setConditions] = useState<Record<string, unknown>>(template?.defaultConditions || {})
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({})

  // Check if previous period task exists (for request/form agents)
  useEffect(() => {
    if (!open) return
    if (taskType === "request" || taskType === "form") {
      setCheckingPrevious(true)
      fetch(`/api/task-instances/${jobId}/previous-period`, { credentials: "include" })
        .then(res => res.ok ? res.json() : { exists: false })
        .then(data => setPreviousPeriodExists(data.exists))
        .catch(() => setPreviousPeriodExists(false))
        .finally(() => setCheckingPrevious(false))
    } else {
      setPreviousPeriodExists(true)
    }
  }, [open, taskType, jobId])

  const WIZARD_STEPS = [
    { label: "Trigger", description: "Configure when to run" },
    { label: "Configuration", description: "Configure automation" },
    { label: "Confirmation", description: "Review and create" },
  ]

  const canProceed = () => {
    switch (currentStep) {
      case 0: {
        if (!name.trim()) return false
        const events = (conditions._eventTriggers as string[]) || []
        const hasSchedule = !!(conditions._scheduleEnabled as boolean)
        return events.length > 0 || hasSchedule
      }
      case 1: return true
      case 2: return true
      default: return false
    }
  }

  const handleCreate = async () => {
    if (!templateId) return
    setCreating(true)
    setError(null)

    try {
      // Auto-create lineage if the task doesn't have one yet
      let effectiveLineageId = lineageId
      if (!effectiveLineageId) {
        const promoteRes = await fetch(`/api/task-instances/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ createLineage: true }),
        })
        if (!promoteRes.ok) throw new Error("Failed to promote task to recurring")
        const promoteData = await promoteRes.json()
        effectiveLineageId = promoteData.taskInstance.lineageId
      }

      if (!effectiveLineageId) throw new Error("Could not create task lineage")

      const actions = buildActions(templateId, configuration, effectiveLineageId)

      const res = await fetch("/api/automation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          trigger: triggerType,
          conditions,
          actions,
          lineageId: effectiveLineageId,
          taskType,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create agent")
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message || "Something went wrong")
      setCreating(false)
    }
  }

  // No template for this task type
  if (!template || !templateId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              Agent automation is not yet available for {taskType || "this"} task type.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Checking previous period
  if (checkingPrevious) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">Checking task history...</span>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Previous period required but doesn't exist
  if (previousPeriodExists === false && (taskType === "request" || taskType === "form")) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-2">Previous period task required</p>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              A {taskType} agent learns from a previously completed task in an earlier period.
              Complete this task manually first, then create the agent on the next period&apos;s task.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => onOpenChange(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Create Agent — {template.name}
          </DialogTitle>
          <p className="text-sm text-gray-500">
            Linked to: {taskName}
          </p>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 pb-2 border-b">
          {WIZARD_STEPS.map((ws, i) => (
            <div key={ws.label} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                i < currentStep ? "bg-orange-500 text-white" :
                i === currentStep ? "bg-orange-100 text-orange-700 border border-orange-300" :
                "bg-gray-100 text-gray-400"
              }`}>
                {i < currentStep ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={`text-xs ${i === currentStep ? "text-gray-900 font-medium" : "text-gray-400"}`}>
                {ws.label}
              </span>
              {i < WIZARD_STEPS.length - 1 && <div className="w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="py-4">
          {currentStep === 0 && (
            <TriggerConfigurationStep
              name={name}
              onNameChange={setName}
              triggerType={triggerType}
              onTriggerTypeChange={setTriggerType}
              conditions={conditions}
              onConditionsChange={setConditions}
              allowedTriggers={template.allowedTriggers}
            />
          )}
          {currentStep === 1 && (
            <ConfigurationStep
              templateId={templateId}
              selectedTaskId={jobId}
              configuration={configuration}
              onConfigurationChange={setConfiguration}
            />
          )}
          {currentStep === 2 && (
            <ConfirmationStep
              name={name}
              linkedTaskName={taskName}
              linkedTaskType={taskType}
              triggerType={triggerType}
              conditions={conditions}
              configuration={configuration}
              templateId={templateId}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => currentStep === 0 ? onOpenChange(false) : setCurrentStep(currentStep - 1)}
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            {currentStep === 0 ? "Cancel" : "Back"}
          </Button>

          {currentStep < WIZARD_STEPS.length - 1 ? (
            <Button
              size="sm"
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!canProceed()}
            >
              Next
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 mr-1" />
                  Create Agent
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Build workflow actions (same logic as full wizard) ────────────────────────

function buildActions(
  templateId: string,
  config: Record<string, unknown>,
  lineageId: string
) {
  if (templateId === "send-standard-request") {
    return {
      version: 1,
      steps: [{
        id: generateStepId(),
        type: "action",
        label: "Send requests",
        actionType: "send_request",
        actionParams: {
          requestTemplateId: config.requestTemplateId || undefined,
          subjectTemplate: config.subjectTemplate,
          bodyTemplate: config.bodyTemplate,
          htmlBodyTemplate: config.htmlBodyTemplate,
          availableTags: config.availableTags,
          recipientSourceType: "task_history",
          lineageId,
        },
        onError: "fail",
      }],
    }
  }

  if (templateId === "send-form") {
    return {
      version: 1,
      steps: [{
        id: generateStepId(),
        type: "action",
        label: "Send forms",
        actionType: "send_form",
        actionParams: {
          formTemplateId: config.formTemplateId,
          recipientSourceType: "task_history",
          lineageId,
        },
        onError: "fail",
      }],
    }
  }

  if (templateId === "run-reconciliation") {
    return {
      version: 1,
      steps: [{
        id: generateStepId(),
        type: "action",
        label: "Run reconciliation",
        actionType: "run_reconciliation",
        actionParams: {
          reconciliationConfigId: config.reconciliationConfigId,
        },
        onError: "fail",
      }],
    }
  }

  if (templateId === "run-report") {
    return {
      version: 1,
      steps: [{
        id: generateStepId(),
        type: "action",
        label: "Generate report",
        actionType: "complete_report",
        actionParams: {
          reportDefinitionId: config.reportDefinitionId,
          filterBindings: config.reportFilterBindings,
        },
        onError: "fail",
      }],
    }
  }

  return { version: 1, steps: [] }
}
