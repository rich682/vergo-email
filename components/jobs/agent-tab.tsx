"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Bot, Play, Loader2, CheckCircle, Plus, AlertCircle, MoreHorizontal, Pause, Settings, Trash2, Calendar, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SectionHeader } from "@/components/ui/section-header"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TaskAgentWizard } from "@/components/jobs/task-agent-wizard"
import { cronToSchedule, scheduleToCron } from "@/lib/automations/cron-helpers"

interface AgentInfo {
  id: string
  name: string
  isActive: boolean
  taskType: string | null
  conditions: Record<string, unknown>
  cronExpression: string | null
  timezone: string | null
}

interface ExecutionOutcome {
  matchRate?: number
  matchedCount?: number
  summary?: string
}

interface AgentTabProps {
  jobId: string
  lineageId: string | null
  taskType: string | null
  taskName: string
  canEdit?: boolean
  reconciliationConfigId?: string | null
  reportDefinitionId?: string | null
  requestCount: number
  formRequestCount: number
  onJobUpdate?: () => void
}

// ── Schedule helpers (shared with task-agent-wizard) ─────────────────────────

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}${getOrdinalSuffix(i + 1)}`,
}))

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

// ── Edit Agent Dialog ────────────────────────────────────────────────────────

function EditAgentDialog({
  open,
  onOpenChange,
  agent,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: AgentInfo
  onSuccess: () => void
}) {
  const [name, setName] = useState(agent.name)
  const [isActive, setIsActive] = useState(agent.isActive)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Parse existing schedule from cron
  const existingSchedule = agent.cronExpression
    ? cronToSchedule(agent.cronExpression, agent.timezone || "UTC")
    : null

  const [dayOfMonth, setDayOfMonth] = useState(existingSchedule?.dayOfMonth || 1)
  const [hour, setHour] = useState(existingSchedule?.hour ?? 9)
  const [minute, setMinute] = useState(existingSchedule?.minute ?? 0)

  const hour12 = hour % 12 || 12
  const ampm = hour >= 12 ? "PM" : "AM"
  const setHourFrom12 = (h12: number, ap: string) => {
    let h24 = h12 % 12
    if (ap === "PM") h24 += 12
    setHour(h24)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const timezone = agent.timezone || "UTC"
      const cronExpression = scheduleToCron({ frequency: "monthly", dayOfMonth, hour, minute, timezone })

      const updatedConditions = {
        ...agent.conditions,
        cronExpression,
        timezone,
      }

      const res = await fetch("/api/automation-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: agent.id,
          name: name.trim(),
          isActive,
          conditions: updatedConditions,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update agent")
      }

      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      setError(err.message || "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-5 py-2">
          {/* Name */}
          <div>
            <Label className="text-xs text-gray-500">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Schedule */}
          <div>
            <Label className="text-xs text-gray-500">Day of the month</Label>
            <Select
              value={String(dayOfMonth)}
              onValueChange={(v) => setDayOfMonth(parseInt(v))}
            >
              <SelectTrigger className="w-36 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OF_MONTH_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-gray-700">Active</Label>
              <p className="text-xs text-gray-400">When active, this agent will run on its trigger.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Config status check ──────────────────────────────────────────────────────

function getConfigStatus(
  taskType: string | null,
  reconciliationConfigId: string | null | undefined,
  reportDefinitionId: string | null | undefined,
  requestCount: number,
  formRequestCount: number,
  hasAnalysisConversations: boolean | null,
): { configured: boolean; message: string; subtitle: string } {
  if (!taskType) {
    return {
      configured: false,
      message: "Set a task type to enable agents",
      subtitle: "Choose a task type (request, form, report, or reconciliation) from the overview tab.",
    }
  }

  switch (taskType) {
    case "reconciliation":
      return reconciliationConfigId
        ? { configured: true, message: "", subtitle: "" }
        : {
            configured: false,
            message: "Task needs to be configured first — create your first reconciliation",
            subtitle: "Set up a reconciliation from the Reconciliation tab before enabling agents.",
          }
    case "request":
      return requestCount > 0
        ? { configured: true, message: "", subtitle: "" }
        : {
            configured: false,
            message: "Task needs to be configured first — create your first request",
            subtitle: "Send at least one request from the Requests tab before enabling agents.",
          }
    case "report":
      return reportDefinitionId
        ? { configured: true, message: "", subtitle: "" }
        : {
            configured: false,
            message: "Task needs to be configured first — configure your report",
            subtitle: "Link a report definition from the Report tab before enabling agents.",
          }
    case "form":
      return formRequestCount > 0
        ? { configured: true, message: "", subtitle: "" }
        : {
            configured: false,
            message: "Task needs to be configured first — create your first form",
            subtitle: "Send at least one form from the Forms tab before enabling agents.",
          }
    case "analysis":
      if (hasAnalysisConversations === null) return { configured: false, message: "", subtitle: "" } // Still loading
      return hasAnalysisConversations
        ? { configured: true, message: "", subtitle: "" }
        : {
            configured: false,
            message: "Task needs to be configured first — create your first analysis",
            subtitle: "Start an analysis conversation from the Analysis tab before enabling agents.",
          }
    default:
      return {
        configured: false,
        message: "Agent automation is not available for this task type",
        subtitle: "",
      }
  }
}

// ── Main AgentTab component ──────────────────────────────────────────────────

export function AgentTab({
  jobId,
  lineageId,
  taskType,
  taskName,
  canEdit,
  reconciliationConfigId,
  reportDefinitionId,
  requestCount,
  formRequestCount,
  onJobUpdate,
}: AgentTabProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)

  // Edit / delete state
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null)
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Reconciliation sourceType check
  const [reconSourceType, setReconSourceType] = useState<string | null>(null)
  const [reconSourceLoading, setReconSourceLoading] = useState(false)

  // Analysis: check if task has analysis conversations
  const [hasAnalysisConversations, setHasAnalysisConversations] = useState<boolean | null>(null)

  // Per-agent execution state
  const [executionStates, setExecutionStates] = useState<Record<string, {
    state: "idle" | "running" | "completed"
    executionId?: string
    step?: string
    outcome?: ExecutionOutcome
  }>>({})
  const [triggeringAgent, setTriggeringAgent] = useState<string | null>(null)
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  // Fetch reconciliation sourceType when recon config is linked
  useEffect(() => {
    if (taskType === "reconciliation" && reconciliationConfigId) {
      setReconSourceLoading(true)
      fetch(`/api/task-instances/${jobId}/config`, { credentials: "include" })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.config?.reconciliationSourceType) {
            setReconSourceType(data.config.reconciliationSourceType)
          }
        })
        .catch(() => {})
        .finally(() => setReconSourceLoading(false))
    }
  }, [taskType, reconciliationConfigId, jobId])

  // Check if task has analysis conversations
  useEffect(() => {
    if (taskType === "analysis") {
      fetch(`/api/analysis/conversations?taskInstanceId=${jobId}`, { credentials: "include" })
        .then(res => res.ok ? res.json() : { conversations: [] })
        .then(data => setHasAnalysisConversations((data.conversations?.length || 0) > 0))
        .catch(() => setHasAnalysisConversations(false))
    }
  }, [taskType, jobId])

  const fetchAgents = useCallback(async () => {
    if (!lineageId) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await fetch(`/api/automation-rules?lineageId=${lineageId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        const agentList = (data.rules || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          isActive: r.isActive,
          taskType: r.taskType,
          conditions: r.conditions || {},
          cronExpression: r.cronExpression || null,
          timezone: r.timezone || null,
        }))
        setAgents(agentList)

        // Check latest run status for each rule
        for (const rule of data.rules || []) {
          const lastRun = rule.lastRun
          if (lastRun) {
            if (lastRun.status === "RUNNING" || lastRun.status === "PENDING") {
              setExecutionStates(prev => ({
                ...prev,
                [rule.id]: { state: "running", executionId: lastRun.id },
              }))
            } else if (lastRun.status === "COMPLETED" || lastRun.status === "NEEDS_REVIEW") {
              setExecutionStates(prev => ({
                ...prev,
                [rule.id]: { state: "completed", outcome: lastRun.outcome || undefined },
              }))
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching agents:", error)
    } finally {
      setLoading(false)
    }
  }, [lineageId])

  useEffect(() => {
    fetchAgents()
    return () => {
      Object.values(pollRefs.current).forEach(clearInterval)
    }
  }, [fetchAgents])

  const handleRunAgent = async (agentId: string) => {
    setTriggeringAgent(agentId)
    try {
      const res = await fetch(`/api/automation-rules/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        const runId = data.workflowRun?.id
        setExecutionStates(prev => ({
          ...prev,
          [agentId]: { state: "running", executionId: runId, step: "Starting..." },
        }))
        if (runId) {
          // Poll workflow run status
          const pollId = setInterval(async () => {
            try {
              const statusRes = await fetch(`/api/workflow-runs/${runId}`, { credentials: "include" })
              if (statusRes.ok) {
                const statusData = await statusRes.json()
                const run = statusData.run
                const latestLog = run?.auditLogs?.[run.auditLogs.length - 1]
                if (latestLog) {
                  setExecutionStates(prev => ({
                    ...prev,
                    [agentId]: {
                      ...prev[agentId],
                      step: latestLog.action || "Processing...",
                    },
                  }))
                }
                if (run?.status !== "RUNNING" && run?.status !== "PENDING") {
                  setExecutionStates(prev => ({
                    ...prev,
                    [agentId]: { state: "completed", outcome: run?.outcome || undefined },
                  }))
                  clearInterval(pollId)
                  delete pollRefs.current[agentId]
                }
              }
            } catch {
              // Retry on next tick
            }
          }, 2000)
          pollRefs.current[agentId] = pollId
        }
      }
    } catch {
      // Handle error silently
    } finally {
      setTriggeringAgent(null)
    }
  }

  const handlePauseResume = async (agent: AgentInfo) => {
    try {
      await fetch("/api/automation-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: agent.id, isActive: !agent.isActive }),
      })
      fetchAgents()
    } catch {
      // Handle error silently
    }
  }

  const handleDelete = async () => {
    if (!deletingAgentId) return
    setDeleting(true)
    try {
      await fetch(`/api/automation-rules?id=${deletingAgentId}`, {
        method: "DELETE",
        credentials: "include",
      })
      setDeletingAgentId(null)
      fetchAgents()
    } catch {
      // Handle error silently
    } finally {
      setDeleting(false)
    }
  }

  const handleWizardSuccess = () => {
    setShowWizard(false)
    onJobUpdate?.()
    fetchAgents()
  }

  // Helper: format schedule for display on card
  const formatSchedule = (agent: AgentInfo): string | null => {
    if (!agent.cronExpression) return null
    const schedule = cronToSchedule(agent.cronExpression, agent.timezone || "UTC")
    if (!schedule || schedule.frequency !== "monthly") return null
    const day = schedule.dayOfMonth || 1
    const h = schedule.hour % 12 || 12
    const m = String(schedule.minute).padStart(2, "0")
    const ap = schedule.hour >= 12 ? "PM" : "AM"
    return `${day}${getOrdinalSuffix(day)} at ${h}:${m} ${ap}`
  }

  // Gate 1: Task not configured
  const configStatus = getConfigStatus(
    taskType, reconciliationConfigId, reportDefinitionId, requestCount, formRequestCount, hasAnalysisConversations
  )

  if (!configStatus.configured) {
    // Still loading analysis conversations check — show spinner
    if (taskType === "analysis" && hasAnalysisConversations === null) {
      return (
        <div className="space-y-4">
          <SectionHeader title="Agent" icon={<Bot className="w-4 h-4 text-orange-500" />} />
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <SectionHeader title="Agent" icon={<Bot className="w-4 h-4 text-orange-500" />} />
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">{configStatus.message}</p>
            {configStatus.subtitle && (
              <p className="text-xs text-gray-400">{configStatus.subtitle}</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Gate 2: Reconciliation sourceType check
  if (taskType === "reconciliation" && reconciliationConfigId) {
    if (reconSourceLoading) {
      return (
        <div className="space-y-4">
          <SectionHeader title="Agent" icon={<Bot className="w-4 h-4 text-orange-500" />} />
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        </div>
      )
    }

    if (reconSourceType && reconSourceType !== "database_database") {
      return (
        <div className="space-y-4">
          <SectionHeader title="Agent" icon={<Bot className="w-4 h-4 text-orange-500" />} />
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-1">Agents are only available for database to database reconciliations</p>
              <p className="text-xs text-gray-400">The linked reconciliation uses file uploads which cannot be automated. Switch to a Database vs Database configuration to enable agents.</p>
            </CardContent>
          </Card>
        </div>
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Agent" icon={<Bot className="w-4 h-4 text-orange-500" />} />
        {canEdit && (
          <Button size="sm" onClick={() => setShowWizard(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Create Agent
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bot className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-3">No agents linked to this task</p>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setShowWizard(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Create Agent
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const execState = executionStates[agent.id]
            const scheduleText = formatSchedule(agent)
            return (
              <Card key={agent.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <Bot className="w-5 h-5 text-orange-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {!agent.isActive && (
                            <Badge variant="secondary" className="text-[10px]">Paused</Badge>
                          )}
                          {agent.isActive && (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">Active</Badge>
                          )}
                          {scheduleText && (
                            <span className="text-[11px] text-gray-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {scheduleText}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Execution state */}
                      {execState?.state === "running" && (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                          <span className="text-xs text-gray-600 max-w-[150px] truncate">
                            {execState.step || "Running..."}
                          </span>
                        </div>
                      )}
                      {execState?.state === "completed" && execState.outcome && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          {execState.outcome.matchRate !== undefined && (
                            <span className="text-xs font-medium text-gray-700">
                              {execState.outcome.matchRate}% matched
                            </span>
                          )}
                        </div>
                      )}

                      {/* Run button */}
                      {(!execState || execState.state === "idle" || execState.state === "completed") && canEdit && agent.isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunAgent(agent.id)}
                          disabled={triggeringAgent === agent.id}
                          className="text-xs h-7"
                        >
                          {triggeringAgent === agent.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 mr-1" />
                          )}
                          Run
                        </Button>
                      )}

                      {/* Actions dropdown */}
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingAgent(agent)}>
                              <Settings className="w-3.5 h-3.5 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePauseResume(agent)}>
                              {agent.isActive ? (
                                <><Pause className="w-3.5 h-3.5 mr-2" />Pause</>
                              ) : (
                                <><Play className="w-3.5 h-3.5 mr-2" />Resume</>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeletingAgentId(agent.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {showWizard && (
        <TaskAgentWizard
          open={showWizard}
          onOpenChange={setShowWizard}
          jobId={jobId}
          lineageId={lineageId}
          taskType={taskType}
          taskName={taskName}
          onSuccess={handleWizardSuccess}
        />
      )}

      {editingAgent && (
        <EditAgentDialog
          open={!!editingAgent}
          onOpenChange={(open) => { if (!open) setEditingAgent(null) }}
          agent={editingAgent}
          onSuccess={fetchAgents}
        />
      )}

      <ConfirmDialog
        open={!!deletingAgentId}
        onOpenChange={(open) => { if (!open) setDeletingAgentId(null) }}
        title="Delete Agent"
        description="This will deactivate the agent and stop it from running. Existing run history will be preserved."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
