"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Plus, Scale, Link2Off, Search, ChevronRight, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { ReconciliationUpload } from "./reconciliation-upload"
import { ReconciliationResults } from "./reconciliation-results"
import { AgentTaskWidget } from "@/components/agents/agent-task-widget"

interface ReconciliationTabProps {
  jobId: string
  taskName: string
  readOnly?: boolean
}

interface ReconciliationConfigSummary {
  id: string
  name: string
  sourceAConfig: { label: string; columns: any[] }
  sourceBConfig: { label: string; columns: any[] }
  matchingRules: any
  createdAt: string
}

interface ReconciliationRun {
  id: string
  status: "PENDING" | "PROCESSING" | "REVIEW" | "COMPLETE"
  taskInstanceId?: string | null
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

export function ReconciliationTab({ jobId, taskName, readOnly = false }: ReconciliationTabProps) {
  const [loading, setLoading] = useState(true)
  const [linkedConfig, setLinkedConfig] = useState<ReconciliationConfigSummary | null>(null)
  const [activeRun, setActiveRun] = useState<ReconciliationRun | null>(null)
  const [matching, setMatching] = useState(false)
  const [error, setError] = useState("")
  const [viewerDenied, setViewerDenied] = useState(false)

  // Config picker state
  const [allConfigs, setAllConfigs] = useState<ReconciliationConfigSummary[]>([])
  const [configSearch, setConfigSearch] = useState("")
  const [linking, setLinking] = useState(false)

  // ── Load linked config for this task ──────────────────────────────
  const fetchLinkedConfig = useCallback(async () => {
    try {
      // Get the task to see if it has a reconciliationConfigId
      const taskRes = await fetch(`/api/task-instances/${jobId}`)
      if (!taskRes.ok) throw new Error("Failed to load task")
      const taskData = await taskRes.json()
      const configId = taskData.taskInstance?.reconciliationConfigId

      if (configId) {
        // Fetch the full config details
        const configRes = await fetch(`/api/reconciliations/${configId}`)
        if (configRes.status === 403) {
          setViewerDenied(true)
          return
        }
        if (configRes.ok) {
          const configData = await configRes.json()
          setLinkedConfig(configData.config)

          // Find the latest run for this task
          const runs = configData.config.runs || []
          const taskRuns = runs.filter((r: any) => r.taskInstanceId === jobId)
          if (taskRuns.length > 0) {
            // Fetch full run data
            await fetchRun(configId, taskRuns[0].id)
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
      const res = await fetch(`/api/reconciliations/${configId}/runs/${runId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.run) setActiveRun(data.run)
    } catch {
      // ignore
    }
  }

  // ── Load all available configs for the picker ─────────────────────
  const fetchAllConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/reconciliations")
      if (res.ok) {
        const data = await res.json()
        setAllConfigs(data.configs || [])
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchLinkedConfig()
  }, [fetchLinkedConfig])

  // ── Link a config to this task ────────────────────────────────────
  const handleLinkConfig = async (configId: string) => {
    setLinking(true)
    setError("")
    try {
      const res = await fetch(`/api/task-instances/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconciliationConfigId: configId }),
      })
      if (!res.ok) throw new Error("Failed to link reconciliation")

      // Reload linked config
      setLoading(true)
      setLinkedConfig(null)
      setActiveRun(null)
      await fetchLinkedConfig()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLinking(false)
    }
  }

  // ── Unlink config from this task ──────────────────────────────────
  const handleUnlinkConfig = async () => {
    setLinking(true)
    setError("")
    try {
      const res = await fetch(`/api/task-instances/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconciliationConfigId: null }),
      })
      if (!res.ok) throw new Error("Failed to unlink reconciliation")

      setLinkedConfig(null)
      setActiveRun(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLinking(false)
    }
  }

  // ── Run management ────────────────────────────────────────────────
  const handleRunMatching = async () => {
    if (!linkedConfig || !activeRun) return
    setMatching(true)
    setError("")

    try {
      const res = await fetch(`/api/reconciliations/${linkedConfig.id}/runs/${activeRun.id}/match`, {
        method: "POST",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Matching failed")
      }

      await fetchRun(linkedConfig.id, activeRun.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setMatching(false)
    }
  }

  const handleRefresh = async () => {
    if (linkedConfig && activeRun) {
      await fetchRun(linkedConfig.id, activeRun.id)
    }
  }

  const handleNewRun = async () => {
    if (!linkedConfig) return
    try {
      const res = await fetch(`/api/reconciliations/${linkedConfig.id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskInstanceId: jobId }),
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

  // ── Viewer access denied ───────────────────────────────────────────
  if (viewerDenied) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <Lock className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <h3 className="text-sm font-medium text-gray-700 mb-1">Access restricted</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto">
          You don&apos;t have viewer access to this reconciliation. Ask an admin to add you as a viewer.
        </p>
      </div>
    )
  }

  // ── No config linked - show picker ────────────────────────────────
  if (!linkedConfig) {
    // Read-only users just see empty state
    if (readOnly) {
      return (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <Scale className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No reconciliation configured for this task yet.</p>
        </div>
      )
    }

    // Lazy-load all configs when user sees the picker
    if (allConfigs.length === 0) {
      fetchAllConfigs()
    }

    const filteredConfigs = allConfigs.filter((c) => {
      if (!configSearch) return true
      return c.name.toLowerCase().includes(configSearch.toLowerCase())
    })

    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Select a Reconciliation</h3>
          <p className="text-sm text-gray-500">
            Choose an existing reconciliation configuration to link to this task, or{" "}
            <Link href="/dashboard/reconciliations/new" className="text-orange-500 hover:text-orange-600 underline">
              create a new one
            </Link>.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search reconciliations..."
            value={configSearch}
            onChange={(e) => setConfigSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Config list */}
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
          {filteredConfigs.length === 0 ? (
            <div className="text-center py-10">
              <Scale className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                {configSearch ? "No matching reconciliations found" : "No reconciliations available"}
              </p>
              <Link href="/dashboard/reconciliations/new">
                <Button variant="outline" size="sm" className="mt-3">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Build New Reconciliation
                </Button>
              </Link>
            </div>
          ) : (
            filteredConfigs.map((cfg) => (
              <button
                key={cfg.id}
                onClick={() => handleLinkConfig(cfg.id)}
                disabled={linking}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-orange-600">
                    {cfg.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {cfg.sourceAConfig?.label} vs {cfg.sourceBConfig?.label}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400" />
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── Config linked - show run management ───────────────────────────

  // No run yet for this task
  if (!activeRun) {
    return (
      <div className="space-y-4">
        <AgentTaskWidget configId={linkedConfig.id} readOnly={readOnly} />
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-700">{linkedConfig.name}</h3>
            <p className="text-xs text-gray-400">
              {linkedConfig.sourceAConfig?.label} vs {linkedConfig.sourceBConfig?.label}
            </p>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Button
                onClick={handleUnlinkConfig}
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 hover:text-red-500"
                disabled={linking}
              >
                <Link2Off className="w-3.5 h-3.5 mr-1" />
                Unlink
              </Button>
            </div>
          )}
        </div>
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-500 mb-4">
            {readOnly ? "No reconciliation runs yet for this task." : "No runs yet for this task. Start a new reconciliation run."}
          </p>
          {!readOnly && (
            <Button onClick={handleNewRun} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" /> New Run
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  // Run: PENDING - upload files
  if (activeRun.status === "PENDING") {
    return (
      <div className="space-y-4">
        <AgentTaskWidget configId={linkedConfig.id} readOnly={readOnly} />
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-700">{linkedConfig.name}</h3>
            <p className="text-xs text-gray-400">Upload both source files to begin</p>
          </div>
          <Button
            onClick={handleUnlinkConfig}
            variant="ghost"
            size="sm"
            className="text-xs text-gray-400 hover:text-red-500"
            disabled={linking}
          >
            <Link2Off className="w-3.5 h-3.5 mr-1" />
            Unlink
          </Button>
        </div>
        <ReconciliationUpload
          configId={linkedConfig.id}
          runId={activeRun.id}
          sourceALabel={linkedConfig.sourceAConfig.label}
          sourceBLabel={linkedConfig.sourceBConfig.label}
          sourceAFileName={activeRun.sourceAFileName}
          sourceBFileName={activeRun.sourceBFileName}
          onBothUploaded={handleRunMatching}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  // Run: PROCESSING
  if (activeRun.status === "PROCESSING" || matching) {
    return (
      <div className="space-y-4">
        <AgentTaskWidget configId={linkedConfig.id} readOnly={readOnly} />
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-3" />
          <p className="text-sm text-gray-700 font-medium">Reconciling...</p>
          <p className="text-xs text-gray-400 mt-1">
            Matching {activeRun.totalSourceA} &times; {activeRun.totalSourceB} transactions using deterministic + AI matching
          </p>
        </div>
      </div>
    )
  }

  // Run: REVIEW or COMPLETE - show results
  if ((activeRun.status === "REVIEW" || activeRun.status === "COMPLETE") && activeRun.matchResults) {
    return (
      <div className="space-y-4">
        <AgentTaskWidget configId={linkedConfig.id} readOnly={readOnly} />
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">{linkedConfig.name}</h3>
          <div className="flex items-center gap-2">
            {activeRun.status === "COMPLETE" && (
              <Button onClick={handleNewRun} size="sm" variant="outline" className="text-xs">
                <Plus className="w-3 h-3 mr-1" /> New Run
              </Button>
            )}
            <Button
              onClick={handleUnlinkConfig}
              variant="ghost"
              size="sm"
              className="text-xs text-gray-400 hover:text-red-500"
              disabled={linking}
            >
              <Link2Off className="w-3.5 h-3.5 mr-1" />
              Unlink
            </Button>
          </div>
        </div>
        <ReconciliationResults
          configId={linkedConfig.id}
          runId={activeRun.id}
          matchResults={activeRun.matchResults}
          exceptions={(activeRun.exceptions || {}) as Record<string, any>}
          sourceARows={(activeRun.sourceARows || []) as Record<string, any>[]}
          sourceBRows={(activeRun.sourceBRows || []) as Record<string, any>[]}
          sourceALabel={linkedConfig.sourceAConfig.label}
          sourceBLabel={linkedConfig.sourceBConfig.label}
          sourceAColumns={linkedConfig.sourceAConfig.columns}
          sourceBColumns={linkedConfig.sourceBConfig.columns}
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
