"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, Bot, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePermissions } from "@/components/permissions-context"
import { AgentCard } from "@/components/agents/agent-card"
import { AgentCreateWizard } from "@/components/agents/agent-create-wizard"

interface Agent {
  id: string
  name: string
  taskType: string | null
  description: string | null
  configId: string | null
  isActive: boolean
  createdAt: string
  executions: Array<{
    id: string
    status: string
    completedAt: string | null
    createdAt: string
    outcome: any
  }>
  _count: { executions: number; memories: number }
  createdBy: { name: string | null } | null
}

export default function AgentsPage() {
  const router = useRouter()
  const { can } = usePermissions()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)

  const canManage = can("agents:manage")
  const canExecute = can("agents:execute")

  useEffect(() => {
    fetchAgents()
  }, [])

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents")
      if (!res.ok) return
      const data = await res.json()
      setAgents(data.agents || [])
    } catch {
      // Non-critical
    } finally {
      setLoading(false)
    }
  }

  const handleRun = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        // Navigate to the agent detail to see the execution
        router.push(`/dashboard/agents/${agentId}`)
      }
    } catch {
      // Handle error
    }
  }

  const handlePause = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return

    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !agent.isActive }),
      })
      fetchAgents()
    } catch {
      // Handle error
    }
  }

  const handleDelete = async (agentId: string) => {
    if (!confirm("Are you sure you want to delete this agent? This cannot be undone.")) return
    try {
      await fetch(`/api/agents/${agentId}`, { method: "DELETE" })
      fetchAgents()
    } catch {
      // Handle error
    }
  }

  const activeAgents = agents.filter(a => a.isActive)
  const inactiveAgents = agents.filter(a => !a.isActive)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI agents that learn from your accounting data
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Agent
          </Button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-1">No agents yet</h2>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
            Create your first AI Agent to automate reconciliations. Agents learn from your corrections and get smarter with every close cycle.
          </p>
          {canManage && (
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create Your First Agent
            </Button>
          )}
        </div>
      )}

      {/* Agent list */}
      {!loading && agents.length > 0 && (
        <div className="space-y-6">
          {/* Active agents */}
          {activeAgents.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Active Agents ({activeAgents.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeAgents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onRun={handleRun}
                    onEdit={(id) => router.push(`/dashboard/agents/${id}`)}
                    onPause={handlePause}
                    onDelete={handleDelete}
                    onClick={(id) => router.push(`/dashboard/agents/${id}`)}
                    canManage={canManage}
                    canExecute={canExecute}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Inactive agents */}
          {inactiveAgents.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Paused ({inactiveAgents.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {inactiveAgents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onRun={handleRun}
                    onEdit={(id) => router.push(`/dashboard/agents/${id}`)}
                    onPause={handlePause}
                    onDelete={handleDelete}
                    onClick={(id) => router.push(`/dashboard/agents/${id}`)}
                    canManage={canManage}
                    canExecute={canExecute}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create wizard */}
      <AgentCreateWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}
