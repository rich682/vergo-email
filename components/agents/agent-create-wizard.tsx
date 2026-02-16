"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

interface ReconciliationConfig {
  id: string
  name: string
  sourceALabel: string
  sourceBLabel: string
}

interface TaskLineageOption {
  id: string
  name: string
  description: string | null
  latestInstance: { id: string; name: string; status: string; taskType: string | null } | null
}

interface AgentCreateWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefilledLineageId?: string | null
}

const STEPS = [
  { title: "Name & Configuration", description: "What should this agent work on?" },
  { title: "Agent Settings", description: "How should the agent behave?" },
  { title: "Review & Create", description: "Confirm your choices" },
]

const TASK_TYPE_OPTIONS = [
  { value: "reconciliation", label: "Reconciliation" },
  { value: "report", label: "Report" },
  { value: "form", label: "Form" },
  { value: "request", label: "Request" },
]

const THRESHOLD_OPTIONS = [
  { value: "0.95", label: "Conservative (95%)", description: "Fewer recommendations, higher accuracy" },
  { value: "0.85", label: "Balanced (85%)", description: "Good balance of recommendations and accuracy" },
  { value: "0.70", label: "Aggressive (70%)", description: "More recommendations, lower accuracy" },
]

export function AgentCreateWizard({ open, onOpenChange, prefilledLineageId }: AgentCreateWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [taskType, setTaskType] = useState<string>("")
  const [configId, setConfigId] = useState<string>("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [customInstructions, setCustomInstructions] = useState("")
  const [threshold, setThreshold] = useState("0.85")

  // Lineage (recurring task) state
  const [lineageId, setLineageId] = useState<string>(prefilledLineageId || "")
  const [lineages, setLineages] = useState<TaskLineageOption[]>([])
  const [loadingLineages, setLoadingLineages] = useState(false)

  // Available configs
  const [configs, setConfigs] = useState<ReconciliationConfig[]>([])
  const [loadingConfigs, setLoadingConfigs] = useState(false)

  // Load lineages on open
  useEffect(() => {
    if (open && lineages.length === 0) {
      setLoadingLineages(true)
      fetch("/api/task-instances/lineages")
        .then(res => res.json())
        .then(data => setLineages(data.lineages || []))
        .catch(() => {})
        .finally(() => setLoadingLineages(false))
    }
  }, [open, lineages.length])

  // Pre-fill lineageId when prop changes
  useEffect(() => {
    if (prefilledLineageId) setLineageId(prefilledLineageId)
  }, [prefilledLineageId])

  // Load reconciliation configs when task type is reconciliation
  useEffect(() => {
    if (taskType === "reconciliation" && configs.length === 0) {
      setLoadingConfigs(true)
      fetch("/api/reconciliations/configs")
        .then(res => res.json())
        .then(data => setConfigs(data.configs || []))
        .catch(() => {})
        .finally(() => setLoadingConfigs(false))
    }
  }, [taskType, configs.length])

  // Auto-generate name from config selection
  useEffect(() => {
    if (configId && !name) {
      const config = configs.find(c => c.id === configId)
      if (config) {
        setName(`${config.name} Agent`)
      }
    }
  }, [configId, configs, name])

  // Clear configId when switching away from reconciliation
  useEffect(() => {
    if (taskType !== "reconciliation") {
      setConfigId("")
    }
  }, [taskType])

  const canProceed = () => {
    switch (step) {
      case 0: {
        if (!name) return false
        if (taskType === "reconciliation" && !configId) return false
        return true
      }
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
          taskType: taskType || undefined,
          name,
          description: description || undefined,
          configId: configId || undefined,
          configType: taskType === "reconciliation" && configId ? "reconciliation_config" : undefined,
          lineageId: lineageId || undefined,
          settings: {
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
    setTaskType("")
    setConfigId("")
    setLineageId(prefilledLineageId || "")
    setName("")
    setDescription("")
    setCustomInstructions("")
    setThreshold("0.85")
    setError(null)
  }

  const taskTypeLabel = TASK_TYPE_OPTIONS.find(o => o.value === taskType)?.label || "General"

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
          {/* Step 0: Name & Configuration */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Chase Checking Agent"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this agent do?"
                  rows={2}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>Task Type (optional)</Label>
                <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                  What kind of task will this agent work on?
                </p>
                <Select value={taskType} onValueChange={setTaskType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None — general purpose agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reconciliation config picker — shown only when task type is reconciliation */}
              {taskType === "reconciliation" && (
                <div>
                  <Label htmlFor="config">Reconciliation Template</Label>
                  {loadingConfigs ? (
                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading templates...
                    </div>
                  ) : configs.length === 0 ? (
                    <div className="mt-2 p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
                      No reconciliation templates found. Create one in Reconciliations first.
                    </div>
                  ) : (
                    <Select value={configId} onValueChange={setConfigId}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select a reconciliation template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {configs.map(config => (
                          <SelectItem key={config.id} value={config.id}>
                            <div>
                              <div className="font-medium">{config.name}</div>
                              <div className="text-xs text-gray-500">
                                {config.sourceALabel} vs {config.sourceBLabel}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Linked recurring task */}
              <div>
                <Label>Linked Task (optional)</Label>
                <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                  Link this agent to a recurring task so it works on each new period automatically.
                </p>
                {loadingLineages ? (
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading tasks...
                  </div>
                ) : lineages.length === 0 ? (
                  <div className="mt-1.5 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                    No recurring tasks found. Convert a task to recurring first.
                  </div>
                ) : (
                  <Select value={lineageId} onValueChange={setLineageId}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="None — not linked to a task" />
                    </SelectTrigger>
                    <SelectContent>
                      {lineages.map(lin => (
                        <SelectItem key={lin.id} value={lin.id}>
                          <div>
                            <div className="font-medium">{lin.name}</div>
                            {lin.latestInstance && (
                              <div className="text-xs text-gray-500">
                                Latest: {lin.latestInstance.name} ({lin.latestInstance.status})
                              </div>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {/* Step 1: Settings */}
          {step === 1 && (
            <div className="space-y-4">
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
                  rows={4}
                />
              </div>

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
                {description && <ReviewRow label="Description" value={description} />}
                <ReviewRow label="Task Type" value={taskType ? taskTypeLabel : "General"} />
                {taskType === "reconciliation" && configId && (
                  <ReviewRow label="Template" value={configs.find(c => c.id === configId)?.name || configId} />
                )}
                {lineageId && (
                  <ReviewRow label="Linked Task" value={lineages.find(l => l.id === lineageId)?.name || lineageId} />
                )}
                <ReviewRow label="Trigger" value="Manual Only" />
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
