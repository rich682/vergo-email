"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Bot, Play, Loader2, CheckCircle, ExternalLink, Plus, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SectionHeader } from "@/components/ui/section-header"
import Link from "next/link"
import { TaskAgentWizard } from "@/components/jobs/task-agent-wizard"

interface AgentInfo {
  id: string
  name: string
  isActive: boolean
  taskType: string | null
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
      const res = await fetch(`/api/agents?lineageId=${lineageId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        const agentList = (data.agents || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          isActive: a.isActive,
          taskType: a.taskType,
        }))
        setAgents(agentList)

        // Fetch latest execution for each agent
        for (const agent of agentList) {
          try {
            const execRes = await fetch(`/api/agents/${agent.id}/executions`, { credentials: "include" })
            if (execRes.ok) {
              const execData = await execRes.json()
              const latest = execData.executions?.[0]
              if (latest) {
                if (latest.status === "running") {
                  setExecutionStates(prev => ({
                    ...prev,
                    [agent.id]: { state: "running", executionId: latest.id },
                  }))
                } else if (latest.status === "completed" || latest.status === "needs_review") {
                  setExecutionStates(prev => ({
                    ...prev,
                    [agent.id]: { state: "completed", outcome: latest.outcome || undefined },
                  }))
                }
              }
            }
          } catch {
            // Non-critical
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
      const res = await fetch(`/api/agents/${agentId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setExecutionStates(prev => ({
          ...prev,
          [agentId]: { state: "running", executionId: data.executionId, step: "Starting..." },
        }))
        // Start polling
        const pollId = setInterval(async () => {
          try {
            const statusRes = await fetch(
              `/api/agents/${agentId}/executions/${data.executionId}/status`,
              { credentials: "include" }
            )
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              if (statusData.currentStep) {
                setExecutionStates(prev => ({
                  ...prev,
                  [agentId]: {
                    ...prev[agentId],
                    step: statusData.currentStep.action || "Processing...",
                  },
                }))
              }
              if (statusData.status !== "running") {
                setExecutionStates(prev => ({
                  ...prev,
                  [agentId]: { state: "completed", outcome: statusData.outcome || undefined },
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
    } catch {
      // Handle error silently
    } finally {
      setTriggeringAgent(null)
    }
  }

  const handleWizardSuccess = () => {
    setShowWizard(false)
    onJobUpdate?.()
    fetchAgents()
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
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
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

                      {/* Link to agent detail */}
                      <Link href={`/dashboard/automations/${agent.id}`}>
                        <Button size="sm" variant="ghost" className="text-xs h-7 w-7 p-0 text-gray-400 hover:text-orange-600">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
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
    </div>
  )
}
