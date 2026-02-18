"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft,
  Play,
  Loader2,
  History,
  GitBranch,
  Activity,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { usePermissions } from "@/components/permissions-context"
import { TriggerDescriptionText } from "@/components/automations/shared/trigger-description"
import { TriggerIcon } from "@/components/automations/shared/trigger-description"
import { RunsTab } from "@/components/automations/detail/runs-tab"
import { WorkflowTab } from "@/components/automations/detail/workflow-tab"
import { ActivityLogTab } from "@/components/automations/detail/activity-log-tab"
import { SettingsTab } from "@/components/automations/detail/settings-tab"
import type { AutomationRuleDetail } from "@/lib/automations/types"
import type { WorkflowStep } from "@/lib/workflows/types"

const TABS = [
  { id: "runs", label: "Runs", icon: History },
  { id: "workflow", label: "Workflow", icon: GitBranch },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
]

export default function AutomationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const ruleId = params.id as string
  const { can } = usePermissions()

  const [rule, setRule] = useState<AutomationRuleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("runs")
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const canManage = can("agents:manage")
  const canExecute = can("agents:execute")

  const fetchRule = useCallback(async () => {
    try {
      const res = await fetch(`/api/automation-rules/${ruleId}`)
      if (res.ok) {
        const data = await res.json()
        setRule(data.rule)
      } else {
        router.push("/dashboard/automations")
      }
    } catch {
      router.push("/dashboard/automations")
    } finally {
      setLoading(false)
    }
  }, [ruleId, router])

  useEffect(() => {
    fetchRule()
  }, [fetchRule])

  const handleRun = async () => {
    setRunning(true)
    setRunError(null)
    try {
      const res = await fetch(`/api/automation-rules/${ruleId}/run`, { method: "POST" })
      if (res.ok) {
        // Switch to runs tab and refresh
        setActiveTab("runs")
        fetchRule()
      } else {
        const data = await res.json().catch(() => ({}))
        setRunError(data.error || "Failed to run agent")
      }
    } catch {
      setRunError("Failed to run agent. Please try again.")
    } finally {
      setRunning(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent?")) return
    try {
      await fetch(`/api/automation-rules?id=${ruleId}`, { method: "DELETE" })
      router.push("/dashboard/automations")
    } catch {
      // Handle error
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!rule) return null

  const steps = (rule.actions as any)?.steps as WorkflowStep[] || []

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-gray-400 mt-0.5"
            onClick={() => router.push("/dashboard/automations")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <TriggerIcon trigger={rule.trigger} size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-gray-900">{rule.name}</h1>
                  {!rule.isActive && (
                    <Badge variant="secondary" className="text-[10px]">Paused</Badge>
                  )}
                </div>
                <TriggerDescriptionText
                  trigger={rule.trigger}
                  conditions={rule.conditions}
                  className="text-sm text-gray-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canExecute && rule.isActive && (
            <Button size="sm" onClick={handleRun} disabled={running}>
              {running ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1.5" />
              )}
              Run Now
            </Button>
          )}
        </div>
      </div>

      {/* Run error */}
      {runError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {runError}
        </div>
      )}

      {/* Tab navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                className={`flex items-center gap-1.5 pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-orange-500 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "runs" && <RunsTab ruleId={ruleId} />}
      {activeTab === "workflow" && (
        <WorkflowTab
          trigger={rule.trigger}
          conditions={rule.conditions}
          steps={steps}
          canManage={canManage}
          onEdit={() => router.push(`/dashboard/automations/new?edit=${ruleId}`)}
        />
      )}
      {activeTab === "activity" && <ActivityLogTab ruleId={ruleId} />}
      {activeTab === "settings" && (
        <SettingsTab
          rule={rule}
          canManage={canManage}
          onUpdate={fetchRule}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
