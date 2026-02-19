"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, ArrowRight, Check, Loader2, AlertCircle, Info, Calendar, Clock, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { getTemplate } from "@/lib/automations/templates"
import { scheduleToCron } from "@/lib/automations/cron-helpers"
import type { TriggerType } from "@/lib/automations/types"

// Task type → automation template mapping
const TASK_TYPE_TEMPLATE_MAP: Record<string, string> = {
  request: "send-standard-request",
  form: "send-form",
  reconciliation: "run-reconciliation",
  report: "run-report",
  analysis: "run-analysis",
}

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}${getOrdinalSuffix(i + 1)}`,
}))

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))

const MINUTE_OPTIONS = [
  { value: "0", label: "00" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
]

const TYPE_LABELS: Record<string, string> = {
  request: "Request",
  form: "Form",
  reconciliation: "Reconciliation",
  report: "Report",
  analysis: "Analysis",
}

interface AnalysisConversation {
  id: string
  title: string
  databaseIds: string[]
  _count: { messages: number }
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

  // Auto-detect template from task config (handles data-personalized vs standard request)
  const [resolvedTemplateId, setResolvedTemplateId] = useState<string | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(false)

  // Analysis conversation selection
  const [analysisConversations, setAnalysisConversations] = useState<AnalysisConversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  // Fetch task config to determine the correct template
  useEffect(() => {
    if (!open || !taskType) return

    // For request tasks, we need to check if it's data-personalized
    if (taskType === "request") {
      setLoadingConfig(true)
      fetch(`/api/task-instances/${jobId}/config`, { credentials: "include" })
        .then(res => res.ok ? res.json() : { config: {} })
        .then(data => {
          const mode = data.config?.personalizationMode
          setResolvedTemplateId(mode === "csv" ? "send-data-request" : "send-standard-request")
        })
        .catch(() => setResolvedTemplateId("send-standard-request"))
        .finally(() => setLoadingConfig(false))
    } else {
      setResolvedTemplateId(taskType ? TASK_TYPE_TEMPLATE_MAP[taskType] : null)
    }
  }, [open, taskType, jobId])

  // Fetch analysis conversations when wizard opens for analysis tasks
  useEffect(() => {
    if (!open || taskType !== "analysis") return
    setLoadingConversations(true)
    fetch(`/api/analysis/conversations?taskInstanceId=${jobId}`, { credentials: "include" })
      .then(res => res.ok ? res.json() : { conversations: [] })
      .then(data => {
        const convs = data.conversations || []
        setAnalysisConversations(convs)
        // Auto-select if only one conversation
        if (convs.length === 1) {
          setSelectedConversationId(convs[0].id)
        }
      })
      .catch(() => setAnalysisConversations([]))
      .finally(() => setLoadingConversations(false))
  }, [open, taskType, jobId])

  const templateId = resolvedTemplateId
  const template = templateId ? getTemplate(templateId) : null

  // Wizard state — name is auto-derived from task
  const name = `${taskName} Agent`
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({})

  // Schedule state — simple day-of-month + time
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [hour, setHour] = useState(9)
  const [minute, setMinute] = useState(0)
  const [timezone, setTimezone] = useState("UTC")

  // Fetch org timezone from company settings
  useEffect(() => {
    if (!open) return
    fetch("/api/org/accounting-calendar", { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.timezone) setTimezone(data.timezone)
      })
      .catch(() => {})
  }, [open])

  // Auto-fetch config from task when wizard opens (for confirmation display)
  const [configLoaded, setConfigLoaded] = useState(false)
  useEffect(() => {
    if (!open || configLoaded) return
    if (jobId) {
      fetch(`/api/task-instances/${jobId}/config`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : { config: {} }))
        .then((data) => {
          if (data.config && Object.keys(data.config).length > 0) {
            setConfiguration(data.config)
          }
          setConfigLoaded(true)
        })
        .catch(() => setConfigLoaded(true))
    }
  }, [open, jobId, configLoaded])

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

  // Dynamic wizard steps — analysis gets a conversation picker
  const isAnalysis = taskType === "analysis"
  const WIZARD_STEPS = isAnalysis
    ? [
        { label: "Schedule", description: "Set when to run" },
        { label: "Select Analysis", description: "Choose analysis to replay" },
        { label: "Confirm", description: "Review and create" },
      ]
    : [
        { label: "Schedule", description: "Set when to run" },
        { label: "Confirm", description: "Review and create" },
      ]

  const confirmStepIndex = WIZARD_STEPS.length - 1
  const analysisStepIndex = isAnalysis ? 1 : -1

  const canProceed = () => {
    if (isAnalysis && currentStep === analysisStepIndex) {
      return !!selectedConversationId
    }
    return true
  }

  const selectedConversation = analysisConversations.find(c => c.id === selectedConversationId)

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

      const actions = buildActions(templateId, configuration, effectiveLineageId, {
        selectedConversationId,
        selectedConversation,
      })

      // Build conditions with schedule
      const cronExpression = scheduleToCron({ frequency: "monthly", dayOfMonth, hour, minute, timezone })
      const conditions: Record<string, unknown> = {
        _eventTriggers: ["board_created"],
        _scheduleEnabled: true,
        cronExpression,
        timezone,
      }

      const res = await fetch("/api/automation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          trigger: "board_created" as TriggerType,
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

  // Loading config to determine template
  if (loadingConfig) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Agent</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">Detecting task configuration...</span>
          </div>
        </DialogContent>
      </Dialog>
    )
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

  // Helper for time display
  const hour12 = hour % 12 || 12
  const ampm = hour >= 12 ? "PM" : "AM"
  const setHourFrom12 = (h12: number, ap: string) => {
    let h24 = h12 % 12
    if (ap === "PM") h24 += 12
    setHour(h24)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
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
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-1">Schedule</h2>
              <p className="text-sm text-gray-500 mb-6">
                Choose when this agent should run each accounting period.
              </p>

              <div className="space-y-6">
                {/* Day of Month */}
                <div>
                  <Label className="text-xs text-gray-500">Day of the month</Label>
                  <p className="text-[11px] text-gray-400 mt-0.5 mb-1.5">
                    The agent will run on this day each month when a new board is created.
                  </p>
                  <Select
                    value={String(dayOfMonth)}
                    onValueChange={(v) => setDayOfMonth(parseInt(v))}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OF_MONTH_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Time */}
                <div>
                  <Label className="text-xs text-gray-500">Time</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Select value={String(hour12)} onValueChange={(v) => setHourFrom12(parseInt(v), ampm)}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((h) => (
                          <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-gray-400">:</span>
                    <Select value={String(minute)} onValueChange={(v) => setMinute(parseInt(v))}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MINUTE_OPTIONS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={ampm} onValueChange={(v) => setHourFrom12(hour12, v)}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* How it triggers explanation */}
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span>
                    {isAnalysis
                      ? "This agent replays the selected analysis prompts against fresh data each period when a new monthly board is created."
                      : template.requiresDatabase
                      ? "This agent runs when a new monthly board is created and connected database(s) have data for that period. It will automatically detect new period data and execute at the scheduled time."
                      : "This agent runs when a new monthly board is created. It will repeat the same action from the previous period at the scheduled time."}
                  </span>
                </div>
              </div>
            </div>
          )}

          {isAnalysis && currentStep === analysisStepIndex && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-1">Select Analysis</h2>
              <p className="text-sm text-gray-500 mb-6">
                Choose which analysis conversation to replay each period.
              </p>

              {loadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                  <span className="text-sm text-gray-500">Loading conversations...</span>
                </div>
              ) : analysisConversations.length === 0 ? (
                <div className="py-8 text-center">
                  <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No analysis conversations found for this task.</p>
                  <p className="text-xs text-gray-400 mt-1">Create an analysis from the Analysis tab first.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {analysisConversations.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conv.id)}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        selectedConversationId === conv.id
                          ? "border-orange-300 bg-orange-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <MessageSquare className={`w-4 h-4 flex-shrink-0 ${
                          selectedConversationId === conv.id ? "text-orange-500" : "text-gray-400"
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{conv.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {conv._count.messages} messages
                          </p>
                        </div>
                        {selectedConversationId === conv.id && (
                          <Check className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}

                  <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2 mt-4">
                    <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>
                      The agent will replay all prompts from this conversation against fresh data each period, creating a new analysis with updated results.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === confirmStepIndex && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-1">Review &amp; create</h2>
              <p className="text-sm text-gray-500 mb-6">
                Confirm your agent details before creating.
              </p>

              <div className="space-y-4">
                {/* Name */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Name</h3>
                  <p className="text-sm text-gray-900 font-medium">{name || "Untitled Agent"}</p>
                </div>

                {/* Linked Task */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Linked Task</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900">{taskName}</span>
                    {taskType && (
                      <Badge variant="outline" className="text-[10px]">
                        {TYPE_LABELS[taskType] || taskType}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Selected Analysis (only for analysis tasks) */}
                {isAnalysis && selectedConversation && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Analysis to Replay</h3>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-cyan-500" />
                      <span className="text-sm text-gray-900">{selectedConversation.title}</span>
                      <span className="text-xs text-gray-400">({selectedConversation._count.messages} messages)</span>
                    </div>
                  </div>
                )}

                {/* Schedule */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Schedule</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    <span>{dayOfMonth}{getOrdinalSuffix(dayOfMonth)} of each month</span>
                    <span className="text-gray-300">|</span>
                    <Clock className="w-4 h-4 text-orange-500" />
                    <span>{hour12}:{String(minute).padStart(2, "0")} {ampm}</span>
                  </div>
                </div>

                {/* How it works */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">How this agent triggers</h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-orange-600">1</span>
                      </div>
                      <p className="text-sm text-gray-700">A new monthly board is created for this task</p>
                    </div>
                    {template.requiresDatabase && (
                      <div className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-orange-600">2</span>
                        </div>
                        <p className="text-sm text-gray-700">Connected database(s) are updated with data for that period</p>
                      </div>
                    )}
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-orange-600">{template.requiresDatabase ? "3" : "2"}</span>
                      </div>
                      <p className="text-sm text-gray-700">
                        {isAnalysis
                          ? `The agent replays the analysis prompts against fresh data (${dayOfMonth}${getOrdinalSuffix(dayOfMonth)} at ${hour12}:${String(minute).padStart(2, "0")} ${ampm})`
                          : `The agent runs at the scheduled time (${dayOfMonth}${getOrdinalSuffix(dayOfMonth)} at ${hour12}:${String(minute).padStart(2, "0")} ${ampm})`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
  lineageId: string,
  analysisContext?: {
    selectedConversationId: string | null
    selectedConversation?: AnalysisConversation | null
  }
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

  if (templateId === "send-data-request") {
    return {
      version: 1,
      steps: [{
        id: generateStepId(),
        type: "action",
        label: "Send data requests",
        actionType: "send_request",
        actionParams: {
          requestTemplateId: config.requestTemplateId || undefined,
          subjectTemplate: config.subjectTemplate,
          bodyTemplate: config.bodyTemplate,
          htmlBodyTemplate: config.htmlBodyTemplate,
          availableTags: config.availableTags,
          recipientSourceType: "database",
          databaseId: config.databaseId,
          emailColumnKey: config.emailColumnKey,
          nameColumnKey: config.nameColumnKey,
          filters: config.filters,
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

  if (templateId === "run-analysis") {
    return {
      version: 1,
      steps: [{
        id: generateStepId(),
        type: "action",
        label: "Run analysis",
        actionType: "run_analysis",
        actionParams: {
          conversationId: analysisContext?.selectedConversationId,
          databaseIds: analysisContext?.selectedConversation?.databaseIds || [],
        },
        onError: "fail",
      }],
    }
  }

  return { version: 1, steps: [] }
}
