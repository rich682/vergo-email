"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Play, Settings, ArrowLeft, Loader2, Bot, BarChart3, Brain, History, Activity, Scale, FileBarChart, FileText, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { usePermissions } from "@/components/permissions-context"
import { ExecutionTimeline } from "@/components/agents/execution-timeline"
import { ExecutionProgress } from "@/components/agents/execution-progress"
import { ImprovementChart } from "@/components/agents/improvement-chart"
import { BeforeAfterBadge } from "@/components/agents/before-after-badge"
import { MemoryViewer } from "@/components/agents/memory-viewer"
import type { ExecutionStep } from "@/lib/agents/types"

interface Agent {
  id: string
  name: string
  taskType: string | null
  description: string | null
  configId: string | null
  settings: Record<string, any>
  isActive: boolean
  createdAt: string
  createdBy: { name: string | null; email: string } | null
  _count: { executions: number; memories: number }
}

interface Execution {
  id: string
  status: string
  triggerType: string
  goal: string
  outcome: any
  steps?: ExecutionStep[]
  promptVersion: string | null
  fallbackUsed: boolean
  llmCallCount: number
  totalTokensUsed: number
  estimatedCostUsd: number | null
  executionTimeMs: number | null
  cancelled: boolean
  completedAt: string | null
  createdAt: string
}

const TABS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "runs", label: "Runs", icon: History },
  { key: "memory", label: "Memory", icon: Brain },
  { key: "settings", label: "Settings", icon: Settings },
]

export default function AgentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const agentId = params.id as string
  const { can } = usePermissions()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null)
  const [tab, setTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runningExecutionId, setRunningExecutionId] = useState<string | null>(null)

  const canManage = can("agents:manage")
  const canExecute = can("agents:execute")

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}`)
      if (!res.ok) return
      const data = await res.json()
      setAgent(data.agent)
    } catch {}
  }, [agentId])

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/executions`)
      if (!res.ok) return
      const data = await res.json()
      setExecutions(data.executions || [])

      // Check if there's a running execution
      const runningExec = (data.executions || []).find((e: Execution) => e.status === "running")
      if (runningExec) {
        setRunning(true)
        setRunningExecutionId(runningExec.id)
      }
    } catch {}
  }, [agentId])

  useEffect(() => {
    Promise.all([fetchAgent(), fetchExecutions()]).finally(() => setLoading(false))
  }, [fetchAgent, fetchExecutions])

  const handleRun = async () => {
    setRunning(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        // Poll for the new execution
        setTimeout(fetchExecutions, 1000)
      }
    } catch {
      setRunning(false)
    }
  }

  const handleExecutionComplete = () => {
    setRunning(false)
    setRunningExecutionId(null)
    fetchExecutions()
    fetchAgent()
  }

  const viewExecution = async (executionId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/executions/${executionId}`)
      if (!res.ok) return
      const data = await res.json()
      setSelectedExecution(data.execution)
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-gray-500">Agent not found.</p>
      </div>
    )
  }

  const lastExecution = executions[0]
  const lastOutcome = lastExecution?.outcome
  const totalRuns = agent._count.executions
  const totalMemories = agent._count.memories

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back + Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/dashboard/agents")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Agents
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              agent.taskType === "reconciliation" ? "bg-emerald-50" :
              agent.taskType === "report" ? "bg-blue-50" :
              agent.taskType === "form" ? "bg-purple-50" :
              agent.taskType === "request" ? "bg-amber-50" :
              "bg-gray-100"
            }`}>
              {agent.taskType === "reconciliation" ? <Scale className="w-5 h-5 text-emerald-600" /> :
               agent.taskType === "report" ? <FileBarChart className="w-5 h-5 text-blue-600" /> :
               agent.taskType === "form" ? <FileText className="w-5 h-5 text-purple-600" /> :
               agent.taskType === "request" ? <Send className="w-5 h-5 text-amber-600" /> :
               <Bot className="w-5 h-5 text-gray-600" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{agent.name}</h1>
                <Badge variant={agent.isActive ? "success" : "secondary"}>
                  {agent.isActive ? "Active" : "Paused"}
                </Badge>
              </div>
              {agent.description && (
                <p className="text-sm text-gray-500 mt-0.5">{agent.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canExecute && agent.isActive && !running && (
              <Button size="sm" onClick={handleRun}>
                <Play className="w-4 h-4 mr-1.5" />
                Run Agent
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Running execution progress */}
      {running && runningExecutionId && (
        <div className="mb-6">
          <ExecutionProgress
            agentId={agentId}
            executionId={runningExecutionId}
            onComplete={handleExecutionComplete}
            onCancel={handleExecutionComplete}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelectedExecution(null) }}
                className={`flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-orange-500 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <OverviewTab
          agent={agent}
          totalRuns={totalRuns}
          totalMemories={totalMemories}
          lastExecution={lastExecution}
          lastOutcome={lastOutcome}
          agentId={agentId}
        />
      )}

      {tab === "runs" && (
        <RunsTab
          executions={executions}
          selectedExecution={selectedExecution}
          onViewExecution={viewExecution}
          onBack={() => setSelectedExecution(null)}
        />
      )}

      {tab === "memory" && (
        <MemoryViewer agentId={agentId} />
      )}

      {tab === "settings" && (
        <SettingsTab agent={agent} canManage={canManage} onUpdate={fetchAgent} />
      )}
    </div>
  )
}

// ── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab({
  agent,
  totalRuns,
  totalMemories,
  lastExecution,
  lastOutcome,
  agentId,
}: {
  agent: Agent
  totalRuns: number
  totalMemories: number
  lastExecution: Execution | undefined
  lastOutcome: any
  agentId: string
}) {
  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Runs" value={String(totalRuns)} />
        <StatCard
          label="Match Rate"
          value={lastOutcome?.matchRate !== undefined ? `${lastOutcome.matchRate}%` : "--"}
        />
        <StatCard
          label="Recommendations"
          value={lastOutcome?.recommended !== undefined ? String(lastOutcome.recommended) : "--"}
        />
        <StatCard label="Memories" value={String(totalMemories)} />
      </div>

      {/* Improvement chart */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Improvement Over Time</h3>
        <ImprovementChart agentId={agentId} />
      </div>

      {/* Latest run summary */}
      {lastExecution && (
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Latest Run</h3>
          <div className="flex items-center gap-3 text-sm">
            <Badge
              variant={
                lastExecution.status === "completed" ? "success" :
                lastExecution.status === "failed" ? "destructive" :
                lastExecution.status === "running" ? "warning" : "secondary"
              }
            >
              {lastExecution.status}
            </Badge>
            {lastExecution.executionTimeMs && (
              <span className="text-gray-500">{(lastExecution.executionTimeMs / 1000).toFixed(1)}s</span>
            )}
            {lastExecution.estimatedCostUsd !== null && (
              <span className="text-gray-500">${lastExecution.estimatedCostUsd.toFixed(4)}</span>
            )}
            {lastOutcome?.matchRate !== undefined && (
              <BeforeAfterBadge baseline={lastOutcome.baselineMatchRate} agentRate={lastOutcome.matchRate} />
            )}
          </div>
          {lastOutcome?.summary && (
            <p className="text-sm text-gray-600 mt-2">{lastOutcome.summary}</p>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

// ── Runs Tab ──────────────────────────────────────────────────────────────────

function RunsTab({
  executions,
  selectedExecution,
  onViewExecution,
  onBack,
}: {
  executions: Execution[]
  selectedExecution: Execution | null
  onViewExecution: (id: string) => void
  onBack: () => void
}) {
  // Execution detail view
  if (selectedExecution) {
    const steps = (selectedExecution.steps || []) as ExecutionStep[]

    return (
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Runs
        </button>

        <div className="mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-gray-900">
              Run #{executions.findIndex(e => e.id === selectedExecution.id) + 1}
            </h3>
            <Badge
              variant={
                selectedExecution.status === "completed" ? "success" :
                selectedExecution.status === "failed" ? "destructive" : "secondary"
              }
            >
              {selectedExecution.status}
            </Badge>
            <span className="text-xs text-gray-400">
              {new Date(selectedExecution.createdAt).toLocaleString()}
            </span>
          </div>

          {selectedExecution.outcome?.summary && (
            <p className="text-sm text-gray-600 mt-2">{selectedExecution.outcome.summary}</p>
          )}

          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            {selectedExecution.executionTimeMs && (
              <span>{(selectedExecution.executionTimeMs / 1000).toFixed(1)}s</span>
            )}
            <span>{selectedExecution.llmCallCount} LLM calls</span>
            <span>{selectedExecution.totalTokensUsed.toLocaleString()} tokens</span>
            {selectedExecution.estimatedCostUsd !== null && (
              <span>${selectedExecution.estimatedCostUsd.toFixed(4)}</span>
            )}
            {selectedExecution.fallbackUsed && (
              <Badge variant="warning" className="text-[10px]">Fallback Used</Badge>
            )}
          </div>
        </div>

        {/* Reasoning trace */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Reasoning Trace</h4>
          <ExecutionTimeline steps={steps} isRunning={selectedExecution.status === "running"} />
        </div>
      </div>
    )
  }

  // Execution list
  if (executions.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-500">
        No runs yet. Click "Run Agent" to start the first execution.
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2.5">#</th>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Match Rate</th>
            <th className="px-4 py-2.5">Recs</th>
            <th className="px-4 py-2.5">Duration</th>
            <th className="px-4 py-2.5">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {executions.map((exec, i) => (
            <tr
              key={exec.id}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => onViewExecution(exec.id)}
            >
              <td className="px-4 py-3 text-sm text-gray-900">{executions.length - i}</td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {new Date(exec.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    exec.status === "completed" ? "success" :
                    exec.status === "failed" ? "destructive" :
                    exec.status === "running" ? "warning" : "secondary"
                  }
                  className="text-[10px]"
                >
                  {exec.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm text-gray-900">
                {exec.outcome?.matchRate !== undefined ? `${exec.outcome.matchRate}%` : "--"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {exec.outcome?.recommended ?? "--"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {exec.executionTimeMs ? `${(exec.executionTimeMs / 1000).toFixed(1)}s` : "--"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {exec.estimatedCostUsd !== null ? `$${exec.estimatedCostUsd.toFixed(3)}` : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({
  agent,
  canManage,
  onUpdate,
}: {
  agent: Agent
  canManage: boolean
  onUpdate: () => void
}) {
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description || "")
  const [customInstructions, setCustomInstructions] = useState(agent.settings?.customInstructions || "")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          settings: {
            ...agent.settings,
            customInstructions: customInstructions || undefined,
          },
        }),
      })
      onUpdate()
    } catch {
      // Handle error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <label className="text-sm font-medium text-gray-700">Agent Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canManage}
          className="mt-1.5 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-50"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canManage}
          rows={2}
          className="mt-1.5 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-50"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Agent Instructions</label>
        <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
          Domain-specific guidance for the agent
        </p>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          disabled={!canManage}
          rows={4}
          placeholder="e.g., Pay special attention to vendor timing differences..."
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-50"
        />
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <p>Created: {new Date(agent.createdAt).toLocaleDateString()}</p>
        <p>Created by: {agent.createdBy?.name || agent.createdBy?.email || "Unknown"}</p>
        <p>Type: {agent.taskType || "General"}</p>
        <p>Config: {agent.configId || "None"}</p>
        <p>Threshold: {agent.settings?.confidenceThreshold || 0.85}</p>
      </div>

      {canManage && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      )}
    </div>
  )
}
