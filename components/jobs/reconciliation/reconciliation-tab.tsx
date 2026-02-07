"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReconciliationSetup } from "./reconciliation-setup"
import { ReconciliationUpload } from "./reconciliation-upload"
import { ReconciliationResults } from "./reconciliation-results"

interface ReconciliationTabProps {
  jobId: string
  taskName: string
}

interface ReconciliationConfig {
  id: string
  name: string
  sourceAConfig: { label: string; columns: any[] }
  sourceBConfig: { label: string; columns: any[] }
  matchingRules: any
  runs: ReconciliationRun[]
}

interface ReconciliationRun {
  id: string
  status: "PENDING" | "PROCESSING" | "REVIEW" | "COMPLETE"
  sourceAFileName?: string | null
  sourceBFileName?: string | null
  sourceARows?: any[] | null
  sourceBRows?: any[] | null
  matchResults?: any | null
  exceptions?: Record<string, any> | null
  matchedCount: number
  exceptionCount: number
  variance: number
  totalSourceA: number
  totalSourceB: number
  completedAt?: string | null
  completedBy?: string | null
  completedByUser?: { name?: string | null; email: string } | null
  createdAt: string
}

export function ReconciliationTab({ jobId, taskName }: ReconciliationTabProps) {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<ReconciliationConfig | null>(null)
  const [activeRun, setActiveRun] = useState<ReconciliationRun | null>(null)
  const [matching, setMatching] = useState(false)
  const [error, setError] = useState("")

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/reconciliations?taskInstanceId=${jobId}`)
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()

      const taskConfig = (data.configs || []).find(
        (c: any) => c.taskInstanceId === jobId || c.taskInstance?.id === jobId
      )

      if (taskConfig) {
        setConfig(taskConfig)
        const configRes = await fetch(`/api/reconciliations/${taskConfig.id}`)
        if (configRes.ok) {
          const configData = await configRes.json()
          setConfig(configData.config)

          if (configData.config.runs?.length > 0) {
            const latestRunId = configData.config.runs[0].id
            await fetchRun(taskConfig.id, latestRunId)
          }
        }
      }
    } catch (err: any) {
      console.error("[ReconciliationTab] Error:", err)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  const fetchRun = async (configId: string, runId: string) => {
    try {
      const res = await fetch(`/api/reconciliations/${configId}/runs`)
      if (!res.ok) return
      const data = await res.json()
      const run = (data.runs || []).find((r: any) => r.id === runId)
      if (run) setActiveRun(run)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const handleConfigCreated = async (configId: string) => {
    // The new setup flow creates config + run + uploads + triggers matching all at once.
    // Just reload everything.
    await fetchConfig()
  }

  const handleRunMatching = async () => {
    if (!config || !activeRun) return
    setMatching(true)
    setError("")

    try {
      const res = await fetch(`/api/reconciliations/${config.id}/runs/${activeRun.id}/match`, {
        method: "POST",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Matching failed")
      }

      await fetchRun(config.id, activeRun.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setMatching(false)
    }
  }

  const handleRefresh = async () => {
    if (config && activeRun) {
      await fetchRun(config.id, activeRun.id)
    }
  }

  const handleNewRun = async () => {
    if (!config) return
    try {
      const res = await fetch(`/api/reconciliations/${config.id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const { run } = await res.json()
        setActiveRun(run)
      }
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // No config yet - show the AI-native upload-first setup
  if (!config) {
    return <ReconciliationSetup taskInstanceId={jobId} taskName={taskName} onCreated={handleConfigCreated} />
  }

  // Config exists but no run yet
  if (!activeRun) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 mb-4">Reconciliation configured. Create a new run to begin.</p>
        <Button onClick={handleNewRun} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="w-4 h-4 mr-2" /> New Run
        </Button>
      </div>
    )
  }

  // Run exists - show appropriate phase
  if (activeRun.status === "PENDING") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">
            {config.name}
          </h3>
          <span className="text-xs text-gray-400">Upload both source files to begin</span>
        </div>
        <ReconciliationUpload
          configId={config.id}
          runId={activeRun.id}
          sourceALabel={config.sourceAConfig.label}
          sourceBLabel={config.sourceBConfig.label}
          sourceAFileName={activeRun.sourceAFileName}
          sourceBFileName={activeRun.sourceBFileName}
          onBothUploaded={handleRunMatching}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  if (activeRun.status === "PROCESSING" || matching) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-3" />
        <p className="text-sm text-gray-700 font-medium">Running reconciliation...</p>
        <p className="text-xs text-gray-400 mt-1">
          Matching {activeRun.totalSourceA} x {activeRun.totalSourceB} transactions using deterministic + AI matching
        </p>
      </div>
    )
  }

  // REVIEW or COMPLETE status - show results
  if ((activeRun.status === "REVIEW" || activeRun.status === "COMPLETE") && activeRun.matchResults) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">{config.name}</h3>
          {activeRun.status === "COMPLETE" && (
            <Button onClick={handleNewRun} size="sm" variant="outline" className="text-xs">
              <Plus className="w-3 h-3 mr-1" /> New Run
            </Button>
          )}
        </div>
        <ReconciliationResults
          configId={config.id}
          runId={activeRun.id}
          matchResults={activeRun.matchResults}
          exceptions={(activeRun.exceptions || {}) as Record<string, any>}
          sourceARows={(activeRun.sourceARows || []) as Record<string, any>[]}
          sourceBRows={(activeRun.sourceBRows || []) as Record<string, any>[]}
          sourceALabel={config.sourceAConfig.label}
          sourceBLabel={config.sourceBConfig.label}
          matchedCount={activeRun.matchedCount}
          exceptionCount={activeRun.exceptionCount}
          variance={activeRun.variance}
          totalSourceA={activeRun.totalSourceA}
          totalSourceB={activeRun.totalSourceB}
          status={activeRun.status}
          completedAt={activeRun.completedAt}
          completedByUser={activeRun.completedByUser}
          onComplete={handleRefresh}
          onRefresh={handleRefresh}
        />
      </div>
    )
  }

  return null
}
