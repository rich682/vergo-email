"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Clock, Database, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
import { CronBuilder } from "@/components/automations/wizard/cron-builder"
import { scheduleToCron } from "@/lib/automations/cron-helpers"
import type { CronSchedule } from "@/lib/automations/types"

interface TaskOption {
  id: string
  name: string
  status: string
  taskType: string | null
  lineageId: string | null
  reconciliationConfigId: string | null
}

interface AgentCreateWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefilledTaskId?: string | null
}

const STEPS = [
  { title: "Select Task", description: "Which task should this agent automate?" },
  { title: "Triggers & Settings", description: "When and how should the agent run?" },
  { title: "Review & Create", description: "Confirm your choices" },
]

const THRESHOLD_OPTIONS = [
  { value: "0.95", label: "Conservative (95%)", description: "Fewer recommendations, higher accuracy" },
  { value: "0.85", label: "Balanced (85%)", description: "Good balance of recommendations and accuracy" },
  { value: "0.70", label: "Aggressive (70%)", description: "More recommendations, lower accuracy" },
]

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  COMPLETE: "bg-emerald-100 text-emerald-700",
}

/** Task types that have database linkage */
const DATABASE_LINKED_TASK_TYPES = new Set(["reconciliation", "report"])

export function AgentCreateWizard({ open, onOpenChange, prefilledTaskId }: AgentCreateWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 0: Task & Name
  const [taskInstanceId, setTaskInstanceId] = useState<string>(prefilledTaskId || "")
  const [name, setName] = useState("")
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)

  // Step 1: Triggers & Settings
  const [triggerType, setTriggerType] = useState<"scheduled" | "database_changed">("scheduled")
  const [customInstructions, setCustomInstructions] = useState("")
  const [threshold, setThreshold] = useState("0.85")

  // Schedule state for time-based trigger
  const defaultSchedule: CronSchedule = {
    frequency: "monthly",
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  }
  const [schedule, setSchedule] = useState<CronSchedule>(defaultSchedule)

  // Load tasks on open
  useEffect(() => {
    if (open && tasks.length === 0) {
      setLoadingTasks(true)
      fetch("/api/task-instances/lineages")
        .then(res => res.json())
        .then(data => setTasks(data.tasks || []))
        .catch(() => {})
        .finally(() => setLoadingTasks(false))
    }
  }, [open, tasks.length])

  // Pre-fill taskInstanceId when prop changes
  useEffect(() => {
    if (prefilledTaskId) setTaskInstanceId(prefilledTaskId)
  }, [prefilledTaskId])

  // Auto-generate name when task is selected
  useEffect(() => {
    if (taskInstanceId && !name) {
      const task = tasks.find(t => t.id === taskInstanceId)
      if (task) {
        setName(`${task.name} Agent`)
      }
    }
  }, [taskInstanceId, tasks, name])

  const selectedTask = tasks.find(t => t.id === taskInstanceId) || null
  const hasDatabaseLinkage = DATABASE_LINKED_TASK_TYPES.has(selectedTask?.taskType || "")

  // If task changes and loses database linkage, fall back to scheduled
  useEffect(() => {
    if (!hasDatabaseLinkage && triggerType === "database_changed") {
      setTriggerType("scheduled")
    }
  }, [hasDatabaseLinkage, triggerType])

  const canProceed = () => {
    switch (step) {
      case 0: return !!name && !!taskInstanceId
      case 1: return true
      case 2: return true
      default: return false
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    setError(null)

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          taskInstanceId,
          settings: {
            triggerMode: "automatic",
            triggerType,
            ...(triggerType === "scheduled" ? {
              cronExpression: scheduleToCron(schedule),
              timezone: schedule.timezone,
            } : {}),
            customInstructions: customInstructions || undefined,
            confidenceThreshold: parseFloat(threshold),
            maxIterations: 10,
            notifyOnCompletion: true,
            notifyOnReview: true,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create agent")
      }

      const data = await res.json()
      onOpenChange(false)
      router.push(`/dashboard/agents/${data.agent.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleReset = () => {
    setStep(0)
    setTaskInstanceId(prefilledTaskId || "")
    setName("")
    setTriggerType("scheduled")
    setCustomInstructions("")
    setThreshold("0.85")
    setSchedule(defaultSchedule)
    setError(null)
  }

  const triggerLabel = triggerType === "database_changed"
    ? "Database update"
    : "Time-based (scheduled)"

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) handleReset() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{STEPS[step].title}</DialogTitle>
          <p className="text-sm text-gray-500">{STEPS[step].description}</p>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-orange-500" : "bg-gray-200"}`}
            />
          ))}
        </div>

        <div className="min-h-[280px] py-2">
          {/* Step 0: Select Task */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>Linked Task</Label>
                <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                  Select the task this agent will automate for future recurring periods.
                </p>
                {loadingTasks ? (
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading tasks...
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="mt-1.5 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                    No tasks found. Create a task first.
                  </div>
                ) : (
                  <Select value={taskInstanceId} onValueChange={(v) => { setTaskInstanceId(v); if (name && name.endsWith(" Agent")) setName("") }}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select a task..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tasks.map(task => (
                        <SelectItem key={task.id} value={task.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{task.name}</span>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${STATUS_COLORS[task.status] || "bg-gray-100 text-gray-600"}`}
                            >
                              {task.status.replace(/_/g, " ")}
                            </Badge>
                            {task.taskType && (
                              <Badge variant="outline" className="text-[10px]">
                                {task.taskType}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auto-generated from task name"
                  className="mt-1.5"
                />
              </div>
            </div>
          )}

          {/* Step 1: Triggers & Settings */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Trigger Type — card selector */}
              <div>
                <Label>When should this agent run?</Label>
                <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: hasDatabaseLinkage ? "1fr 1fr" : "1fr" }}>
                  {/* Time-based */}
                  <button
                    type="button"
                    onClick={() => setTriggerType("scheduled")}
                    className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 text-left transition-colors ${
                      triggerType === "scheduled"
                        ? "border-orange-400 bg-orange-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      triggerType === "scheduled" ? "bg-orange-100" : "bg-purple-50"
                    }`}>
                      <Clock className={`w-4 h-4 ${
                        triggerType === "scheduled" ? "text-orange-600" : "text-purple-600"
                      }`} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">Time-based</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Run on a recurring schedule
                      </div>
                    </div>
                  </button>

                  {/* Database update — only for tasks with database linkage */}
                  {hasDatabaseLinkage && (
                    <button
                      type="button"
                      onClick={() => setTriggerType("database_changed")}
                      className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 text-left transition-colors ${
                        triggerType === "database_changed"
                          ? "border-orange-400 bg-orange-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        triggerType === "database_changed" ? "bg-orange-100" : "bg-emerald-50"
                      }`}>
                        <Database className={`w-4 h-4 ${
                          triggerType === "database_changed" ? "text-orange-600" : "text-emerald-600"
                        }`} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">Database update</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Run when linked data changes
                        </div>
                      </div>
                    </button>
                  )}
                </div>

                {/* Trigger-specific config */}
                {triggerType === "scheduled" && (
                  <div className="mt-4 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">Schedule</span>
                    </div>
                    <CronBuilder schedule={schedule} onChange={setSchedule} />
                  </div>
                )}

                {triggerType === "database_changed" && (
                  <div className="mt-4 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Database className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">Database update</span>
                    </div>
                    <p className="text-sm text-gray-500">
                      This agent will run automatically whenever the linked dataset is updated &mdash; for example, when new rows are added or existing data is modified.
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      The dataset linkage is determined by the task selected in the previous step.
                    </p>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div>
                <Label htmlFor="instructions">Agent Instructions (optional)</Label>
                <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                  Give your agent domain-specific guidance. It will combine this with what it learns over time.
                </p>
                <Textarea
                  id="instructions"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g., Pay special attention to vendor timing differences. Bank fees are always $15/month from Chase. Flag anything over $10,000 for manual review."
                  rows={3}
                />
              </div>

              {/* Confidence Threshold */}
              <div>
                <Label>Confidence Threshold</Label>
                <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                  How confident must the agent be before recommending a resolution?
                </p>
                <Select value={threshold} onValueChange={setThreshold}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THRESHOLD_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-gray-500">{opt.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <ReviewRow label="Name" value={name} />
                <ReviewRow label="Linked Task" value={selectedTask?.name || taskInstanceId} />
                {selectedTask?.taskType && (
                  <ReviewRow label="Task Type" value={selectedTask.taskType.charAt(0).toUpperCase() + selectedTask.taskType.slice(1)} />
                )}
                <ReviewRow label="Trigger" value={triggerLabel} />
                <ReviewRow
                  label="Threshold"
                  value={THRESHOLD_OPTIONS.find(o => o.value === threshold)?.label || threshold}
                />
                {customInstructions && (
                  <ReviewRow label="Instructions" value={customInstructions.substring(0, 100) + (customInstructions.length > 100 ? "..." : "")} />
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <Button
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep(s => s - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              size="sm"
              disabled={!canProceed()}
              onClick={() => setStep(s => s + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={creating}
              onClick={handleCreate}
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Agent"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-gray-500 w-24 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  )
}
