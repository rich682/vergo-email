"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Zap, Loader2 } from "lucide-react"
import { usePermissions } from "@/components/permissions-context"
import { AutomationCard } from "@/components/automations/automation-card"
import { AutomationStats } from "@/components/automations/automation-stats"
import { AutomationActivityFeed } from "@/components/automations/automation-activity-feed"
import { EmptyState } from "@/components/ui/empty-state"
import type { AutomationRuleListItem, WorkflowRunListItem } from "@/lib/automations/types"

export default function AutomationsPage() {
  const router = useRouter()
  const { can } = usePermissions()
  const [rules, setRules] = useState<AutomationRuleListItem[]>([])
  const [recentRuns, setRecentRuns] = useState<WorkflowRunListItem[]>([])
  const [loading, setLoading] = useState(true)

  const canManage = can("agents:manage")
  const canExecute = can("agents:execute")

  const fetchData = useCallback(async () => {
    try {
      const [rulesRes, runsRes] = await Promise.all([
        fetch("/api/automation-rules"),
        fetch("/api/workflow-runs?limit=8"),
      ])
      if (rulesRes.ok) {
        const data = await rulesRes.json()
        setRules(data.rules || [])
      }
      if (runsRes.ok) {
        const data = await runsRes.json()
        setRecentRuns(data.runs || [])
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRun = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/automation-rules/${ruleId}/run`, {
        method: "POST",
      })
      if (res.ok) {
        router.push(`/dashboard/automations/${ruleId}`)
      }
    } catch {
      // Handle error
    }
  }

  const handlePause = async (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId)
    if (!rule) return
    try {
      await fetch("/api/automation-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ruleId, isActive: !rule.isActive }),
      })
      fetchData()
    } catch {
      // Handle error
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Are you sure you want to deactivate this agent?")) return
    try {
      await fetch(`/api/automation-rules?id=${ruleId}`, { method: "DELETE" })
      fetchData()
    } catch {
      // Handle error
    }
  }

  const activeRules = rules.filter((r) => r.isActive)
  const inactiveRules = rules.filter((r) => !r.isActive)

  // Compute stats
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const runsThisMonth = recentRuns.filter((r) => new Date(r.createdAt) >= monthStart).length
  const completedRuns = recentRuns.filter((r) => r.status === "COMPLETED" || r.status === "FAILED")
  const successRate = completedRuns.length > 0
    ? Math.round((completedRuns.filter((r) => r.status === "COMPLETED").length / completedRuns.length) * 100)
    : -1
  const pendingApprovals = recentRuns.filter((r) => r.status === "WAITING_APPROVAL").length

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Create and manage agents to automate recurring workflows
          </p>
        </div>
        {/* Agent creation is handled via the agent create wizard dialog */}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && rules.length === 0 && (
        <EmptyState
          icon={<Zap className="w-6 h-6" />}
          title="No agents yet"
          description="Set up your first agent to automate recurring workflows like sending requests, running reconciliations, or generating reports."
          action={undefined}
        />
      )}

      {/* Main content */}
      {!loading && rules.length > 0 && (
        <div className="space-y-8">
          {/* Activity Summary */}
          <AutomationStats
            activeCount={activeRules.length}
            runsThisMonth={runsThisMonth}
            successRate={successRate}
            pendingApprovals={pendingApprovals}
          />

          {/* Recent Activity */}
          {recentRuns.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Recent Activity
              </h2>
              <AutomationActivityFeed runs={recentRuns} />
            </div>
          )}

          {/* Active agents */}
          {activeRules.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Active Agents ({activeRules.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeRules.map((rule) => (
                  <AutomationCard
                    key={rule.id}
                    rule={rule}
                    onRun={handleRun}
                    onEdit={(id) => router.push(`/dashboard/automations/${id}`)}
                    onPause={handlePause}
                    onDelete={handleDelete}
                    onClick={(id) => router.push(`/dashboard/automations/${id}`)}
                    canManage={canManage}
                    canExecute={canExecute}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Paused agents */}
          {inactiveRules.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                Paused ({inactiveRules.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {inactiveRules.map((rule) => (
                  <AutomationCard
                    key={rule.id}
                    rule={rule}
                    onRun={handleRun}
                    onEdit={(id) => router.push(`/dashboard/automations/${id}`)}
                    onPause={handlePause}
                    onDelete={handleDelete}
                    onClick={(id) => router.push(`/dashboard/automations/${id}`)}
                    canManage={canManage}
                    canExecute={canExecute}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
