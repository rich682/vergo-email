"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePermissions } from "@/components/permissions-context"
import { RunHeader } from "@/components/automations/run-detail/run-header"
import { RunTimeline } from "@/components/automations/run-detail/run-timeline"
import { ApprovalActionPanel } from "@/components/automations/run-detail/approval-action-panel"
import type { WorkflowRunDetail } from "@/lib/automations/types"

export default function RunDetailPage() {
  const router = useRouter()
  const params = useParams()
  const ruleId = params.id as string
  const runId = params.runId as string
  const { can } = usePermissions()

  const [run, setRun] = useState<WorkflowRunDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const canManage = can("agents:manage")

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflow-runs/${runId}`)
      if (res.ok) {
        const data = await res.json()
        setRun(data.run)
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    fetchRun()
  }, [fetchRun])

  // Poll while running or waiting for approval
  useEffect(() => {
    if (!run) return
    const shouldPoll = run.status === "RUNNING" || run.status === "PENDING"
    if (!shouldPoll) return

    const interval = setInterval(fetchRun, 3000)
    return () => clearInterval(interval)
  }, [run, fetchRun])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 text-center">
        <p className="text-sm text-gray-500">Run not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push(`/dashboard/automations/${ruleId}`)}
        >
          Back to Agent
        </Button>
      </div>
    )
  }

  // Find the current waiting step for approval panel
  const waitingStepId = run.status === "WAITING_APPROVAL" ? run.currentStepId : null
  const waitingAuditLog = waitingStepId
    ? run.auditLogs?.find((l) => l.stepId === waitingStepId && l.actionType === "approval_requested")
    : null
  const approvalMessage = waitingAuditLog?.detail?.message as string | undefined

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back link */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-gray-400"
          onClick={() => router.push(`/dashboard/automations/${ruleId}`)}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Run Detail</h1>
          <p className="text-sm text-gray-500">{run.automationRule.name}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Approval panel */}
        {run.status === "WAITING_APPROVAL" && waitingStepId && canManage && (
          <ApprovalActionPanel
            runId={run.id}
            stepId={waitingStepId}
            approvalMessage={approvalMessage}
            onApproved={fetchRun}
          />
        )}

        {/* Run header */}
        <RunHeader run={run} />

        {/* Step timeline */}
        <div className="border border-gray-200 rounded-lg p-4 bg-white">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Step Results
          </h3>
          <RunTimeline
            stepResults={run.stepResults || []}
            currentStepId={run.currentStepId}
            status={run.status}
          />
        </div>

        {/* Audit logs */}
        {run.auditLogs && run.auditLogs.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Audit Log
            </h3>
            <div className="space-y-1.5">
              {run.auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${
                      log.outcome === "success" ? "text-green-600" :
                      log.outcome === "failed" ? "text-red-600" :
                      "text-gray-500"
                    }`}>
                      {log.actionType.replace(/_/g, " ")}
                    </span>
                    {log.stepId && <span className="text-gray-400">({log.stepId})</span>}
                  </div>
                  <span className="text-gray-400">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
