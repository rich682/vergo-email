"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Bot, Play, Loader2, CheckCircle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

interface AgentTaskWidgetProps {
  configId: string
  readOnly?: boolean
}

interface AgentInfo {
  id: string
  name: string
  isActive: boolean
}

interface ExecutionOutcome {
  matchRate?: number
  matchedCount?: number
  summary?: string
}

export function AgentTaskWidget({ configId, readOnly = false }: AgentTaskWidgetProps) {
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [executionState, setExecutionState] = useState<"idle" | "running" | "completed">("idle")
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null)
  const [lastOutcome, setLastOutcome] = useState<ExecutionOutcome | null>(null)
  const [runningStep, setRunningStep] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch agent linked to this config ────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function fetchAgent() {
      try {
        const res = await fetch(`/api/agents?configId=${configId}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        const found = data.agents?.[0]
        if (!found || cancelled) return

        setAgent({ id: found.id, name: found.name, isActive: found.isActive })

        // Fetch latest execution
        const execRes = await fetch(`/api/agents/${found.id}/executions`)
        if (!execRes.ok || cancelled) return
        const execData = await execRes.json()
        const latest = execData.executions?.[0]

        if (latest) {
          if (latest.status === "running") {
            setExecutionState("running")
            setActiveExecutionId(latest.id)
          } else if (latest.status === "completed" || latest.status === "needs_review") {
            setExecutionState("completed")
            setLastOutcome((latest.outcome as ExecutionOutcome) || null)
          }
        }
      } catch {
        // Non-critical — widget just won't show
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAgent()
    return () => { cancelled = true }
  }, [configId])

  // ── Poll running execution ───────────────────────────────────────
  const pollStatus = useCallback(async () => {
    if (!agent || !activeExecutionId) return

    try {
      const res = await fetch(
        `/api/agents/${agent.id}/executions/${activeExecutionId}/status`
      )
      if (!res.ok) return
      const data = await res.json()

      if (data.currentStep) {
        setRunningStep(data.currentStep.action || "Processing...")
      }

      if (data.status !== "running") {
        // Execution finished
        setExecutionState("completed")
        setLastOutcome((data.outcome as ExecutionOutcome) || null)
        setRunningStep(null)
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    } catch {
      // Polling error — will retry on next tick
    }
  }, [agent, activeExecutionId])

  useEffect(() => {
    if (executionState === "running" && activeExecutionId) {
      pollRef.current = setInterval(pollStatus, 2000)
      return () => {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
  }, [executionState, activeExecutionId, pollStatus])

  // ── Trigger agent run ────────────────────────────────────────────
  const handleRun = async () => {
    if (!agent) return
    setTriggering(true)

    try {
      const res = await fetch(`/api/agents/${agent.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setExecutionState("running")
        setActiveExecutionId(data.executionId || null)
        setRunningStep("Starting...")
      }
    } catch {
      // Handle error silently
    } finally {
      setTriggering(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  // Don't render if no agent or still loading
  if (loading || !agent) return null

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-orange-200 bg-gradient-to-r from-orange-50 to-white">
      <div className="flex items-center gap-2 min-w-0">
        <Bot className="w-4 h-4 text-orange-500 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-900 truncate">{agent.name}</span>
        {!agent.isActive && (
          <Badge variant="secondary" className="text-[10px] flex-shrink-0">Paused</Badge>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Idle state */}
        {executionState === "idle" && !readOnly && agent.isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRun}
            disabled={triggering}
            className="text-xs h-7"
          >
            {triggering ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Play className="w-3 h-3 mr-1" />
            )}
            Run Agent
          </Button>
        )}

        {/* Running state */}
        {executionState === "running" && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
            <span className="text-xs text-gray-600 max-w-[150px] truncate">
              {runningStep || "Running..."}
            </span>
          </div>
        )}

        {/* Completed state */}
        {executionState === "completed" && lastOutcome && (
          <div className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            {lastOutcome.matchRate !== undefined && (
              <span className="text-xs font-medium text-gray-700">
                {lastOutcome.matchRate}% matched
              </span>
            )}
          </div>
        )}

        {/* Link to agent detail */}
        <Link href={`/dashboard/agents/${agent.id}`}>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-6 w-6 p-0 text-gray-400 hover:text-orange-600"
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
