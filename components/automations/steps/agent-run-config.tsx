"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AgentRunConfigProps {
  agentDefinitionId?: string
  onAgentChange: (agentDefinitionId: string) => void
}

interface Agent {
  id: string
  name: string
  taskType: string | null
}

export function AgentRunConfig({ agentDefinitionId, onAgentChange }: AgentRunConfigProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.ok ? r.json() : { agents: [] })
      .then((data) => setAgents(data.agents || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-gray-500">AI Agent</Label>
        <Select
          value={agentDefinitionId || ""}
          onValueChange={onAgentChange}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={loading ? "Loading..." : "Select an AI agent"} />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
                {a.taskType && <span className="text-gray-400 ml-1">({a.taskType})</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-gray-400 mt-1">
          The AI agent to run. The agent will analyze data and take actions based on its training.
        </p>
      </div>
    </div>
  )
}
