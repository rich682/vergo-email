"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Scale,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Users,
  ExternalLink,
  Settings,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ViewerManagement, type Viewer } from "@/components/shared/viewer-management"
import { usePermissions } from "@/components/permissions-context"
import { ReconciliationResults } from "@/components/jobs/reconciliation/reconciliation-results"

// ============================================
// Types
// ============================================

interface SourceConfig {
  label: string
  columns: { key: string; label: string; type: string }[]
}

interface MatchingRules {
  amountMatch: "exact" | "tolerance"
  amountTolerance?: number
  dateWindowDays: number
  fuzzyDescription: boolean
  columnTolerances?: Record<string, { type: string; tolerance: number }>
}

interface Run {
  id: string
  status: "PENDING" | "PROCESSING" | "REVIEW" | "COMPLETE"
  boardId: string | null
  taskInstanceId: string | null
  matchedCount: number
  exceptionCount: number
  variance: number
  totalSourceA: number
  totalSourceB: number
  sourceAFileName: string | null
  sourceBFileName: string | null
  createdAt: string
  completedAt: string | null
}

interface FullRunData {
  id: string
  status: string
  matchResults: any
  exceptions: Record<string, any>
  sourceARows: Record<string, any>[]
  sourceBRows: Record<string, any>[]
  matchedCount: number
  exceptionCount: number
  variance: number
  totalSourceA: number
  totalSourceB: number
  completedAt: string | null
  completedByUser?: { name?: string | null; email: string } | null
}

interface TaskInstance {
  id: string
  name: string
  boardId: string
  board: { id: string; name: string }
}

interface ConfigDetail {
  id: string
  name: string
  sourceAConfig: SourceConfig
  sourceBConfig: SourceConfig
  matchingRules: MatchingRules
  createdAt: string
  updatedAt: string
  createdById: string | null
  runs: Run[]
  taskInstances: TaskInstance[]
  viewers: { user: { id: string; name: string | null; email: string } }[]
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  COMPLETE: { icon: <CheckCircle className="w-3.5 h-3.5" />, label: "Complete", color: "text-green-600 bg-green-50" },
  REVIEW: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Review", color: "text-amber-600 bg-amber-50" },
  PROCESSING: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: "Processing", color: "text-blue-600 bg-blue-50" },
  PENDING: { icon: <Clock className="w-3.5 h-3.5" />, label: "Pending", color: "text-gray-600 bg-gray-50" },
}

// ============================================
// Page
// ============================================

export default function ReconciliationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const configId = params.configId as string
  const { can } = usePermissions()
  const canManage = can("reconciliations:manage")

  const [config, setConfig] = useState<ConfigDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected run for viewing results
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRunData, setSelectedRunData] = useState<FullRunData | null>(null)
  const [loadingRun, setLoadingRun] = useState(false)

  // Show/hide config section
  const [configExpanded, setConfigExpanded] = useState(false)

  // Viewer dialog
  const [viewerDialogOpen, setViewerDialogOpen] = useState(false)
  const [viewers, setViewers] = useState<Viewer[]>([])

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/reconciliations/${configId}`)
      if (res.status === 404) {
        setError("Reconciliation not found")
        return
      }
      if (res.status === 403) {
        setError("You don't have access to this reconciliation")
        return
      }
      if (!res.ok) throw new Error("Failed to load reconciliation")

      const data = await res.json()
      setConfig(data.config)
      setViewers(
        (data.config.viewers || []).map((v: any) => ({
          userId: v.user.id,
          name: v.user.name,
          email: v.user.email,
        }))
      )

      // Auto-select the latest run that has results
      const runs = data.config.runs || []
      const latestWithResults = runs.find(
        (r: Run) => r.status === "REVIEW" || r.status === "COMPLETE"
      )
      if (latestWithResults) {
        setSelectedRunId(latestWithResults.id)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [configId])

  // Fetch full run data when selectedRunId changes
  const fetchRunData = useCallback(async (runId: string) => {
    setLoadingRun(true)
    try {
      const res = await fetch(`/api/reconciliations/${configId}/runs/${runId}`)
      if (!res.ok) throw new Error("Failed to load run data")
      const data = await res.json()
      setSelectedRunData({
        id: data.run.id,
        status: data.run.status,
        matchResults: data.run.matchResults,
        exceptions: data.run.exceptions || {},
        sourceARows: data.run.sourceARows || [],
        sourceBRows: data.run.sourceBRows || [],
        matchedCount: data.run.matchedCount,
        exceptionCount: data.run.exceptionCount,
        variance: data.run.variance,
        totalSourceA: data.run.totalSourceA,
        totalSourceB: data.run.totalSourceB,
        completedAt: data.run.completedAt,
        completedByUser: data.run.completedByUser,
      })
    } catch {
      setSelectedRunData(null)
    } finally {
      setLoadingRun(false)
    }
  }, [configId])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  useEffect(() => {
    if (selectedRunId) {
      fetchRunData(selectedRunId)
    }
  }, [selectedRunId, fetchRunData])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/reconciliations/${configId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      router.push("/dashboard/reconciliations")
    } catch {
      setDeleting(false)
    }
  }

  const handleRefreshRun = async () => {
    if (selectedRunId) {
      await fetchRunData(selectedRunId)
    }
    await fetchConfig()
  }

  // ── Loading / Error ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !config) {
    return (
      <div className="p-8">
        <Link
          href="/dashboard/reconciliations"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reconciliations
        </Link>
        <div className="text-center py-16">
          <Scale className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-medium text-gray-900 mb-1">
            {error || "Reconciliation not found"}
          </h3>
          <p className="text-sm text-gray-500">
            This reconciliation may have been deleted or you may not have access.
          </p>
        </div>
      </div>
    )
  }

  // ── Derived data ──────────────────────────────────────────────────
  const latestRun = config.runs?.[0] || null
  const latestStatus = latestRun
    ? STATUS_STYLES[latestRun.status] || STATUS_STYLES.PENDING
    : null
  const matchingRules = config.matchingRules as MatchingRules
  const sourceA = config.sourceAConfig as SourceConfig
  const sourceB = config.sourceBConfig as SourceConfig

  return (
    <div className="p-8 max-w-6xl space-y-6">
      {/* Back */}
      <Link
        href="/dashboard/reconciliations"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Reconciliations
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-purple-500" />
            <h1 className="text-xl font-semibold text-gray-900">{config.name}</h1>
            {latestStatus && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${latestStatus.color}`}>
                {latestStatus.icon}
                {latestStatus.label}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Created {formatDistanceToNow(new Date(config.createdAt), { addSuffix: true })}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewerDialogOpen(true)}
            >
              <Users className="w-4 h-4 mr-1.5" />
              Viewers ({viewers.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Configuration Summary — collapsible */}
      <section className="border rounded-lg overflow-hidden">
        <button
          onClick={() => setConfigExpanded(!configExpanded)}
          className="w-full px-4 py-3 bg-gray-50 border-b flex items-center justify-between hover:bg-gray-100 transition-colors"
        >
          <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400" />
            Configuration
          </h2>
          {configExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {configExpanded && (
          <div className="p-4 space-y-4">
            {/* Sources */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
                  {sourceA.label || "Source A"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {sourceA.columns.map((col) => (
                    <span
                      key={col.key}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700"
                    >
                      {col.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
                  {sourceB.label || "Source B"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {sourceB.columns.map((col) => (
                    <span
                      key={col.key}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700"
                    >
                      {col.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Matching Rules */}
            <div className="flex items-center gap-6 text-xs text-gray-600">
              <span>
                Amount: <span className="font-medium">{matchingRules.amountMatch === "exact" ? "Exact match" : `±$${matchingRules.amountTolerance || 0}`}</span>
              </span>
              <span>
                Date window: <span className="font-medium">{matchingRules.dateWindowDays} days</span>
              </span>
              <span>
                AI fuzzy matching: <span className="font-medium">{matchingRules.fuzzyDescription ? "Enabled" : "Disabled"}</span>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Linked Tasks */}
      {config.taskInstances.length > 0 && (
        <section className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              Linked Tasks ({config.taskInstances.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {config.taskInstances.map((task) => (
              <Link
                key={task.id}
                href={`/dashboard/jobs/${task.id}?tab=reconciliation`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{task.name}</p>
                  <p className="text-xs text-gray-400">{task.board?.name}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-300" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Run History */}
      {config.runs.length > 0 && config.runs.length > 1 && (
        <section className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h2 className="text-sm font-medium text-gray-700">
              Run History ({config.runs.length})
            </h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Results</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {config.runs.map((run) => {
                const runStatus = STATUS_STYLES[run.status] || STATUS_STYLES.PENDING
                const isSelected = selectedRunId === run.id
                const hasResults = run.status === "REVIEW" || run.status === "COMPLETE"
                return (
                  <tr
                    key={run.id}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-orange-50 hover:bg-orange-50"
                        : hasResults
                          ? "hover:bg-gray-50"
                          : "opacity-60"
                    }`}
                    onClick={() => {
                      if (hasResults) {
                        setSelectedRunId(isSelected ? null : run.id)
                      }
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${runStatus.color}`}>
                        {runStatus.icon}
                        {runStatus.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">
                      {run.matchedCount > 0 || run.exceptionCount > 0 ? (
                        <span>
                          <span className="text-green-600 font-medium">{run.matchedCount}</span> matched
                          {run.exceptionCount > 0 && (
                            <>, <span className="text-amber-600">{run.exceptionCount}</span> exceptions</>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {run.matchedCount > 0 || run.exceptionCount > 0 ? (
                        <span className={`text-sm font-medium ${run.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                          ${Math.abs(run.variance).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {run.sourceAFileName && run.sourceBFileName ? (
                        <span>{run.sourceAFileName} / {run.sourceBFileName}</span>
                      ) : (
                        <span className="text-gray-400">No files</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {format(new Date(run.createdAt), "MMM d, yyyy")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Results Panel — shows when a run is selected */}
      {selectedRunId && (
        <section>
          {loadingRun ? (
            <div className="flex items-center justify-center py-12 border rounded-lg">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : selectedRunData?.matchResults ? (
            <ReconciliationResults
              configId={configId}
              runId={selectedRunId}
              matchResults={selectedRunData.matchResults}
              exceptions={selectedRunData.exceptions}
              sourceARows={selectedRunData.sourceARows}
              sourceBRows={selectedRunData.sourceBRows}
              sourceALabel={sourceA.label}
              sourceBLabel={sourceB.label}
              sourceAColumns={sourceA.columns as any}
              sourceBColumns={sourceB.columns as any}
              status={selectedRunData.status}
              onRefresh={handleRefreshRun}
            />
          ) : (
            <div className="text-center py-12 border rounded-lg">
              <Scale className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No match results available for this run</p>
            </div>
          )}
        </section>
      )}

      {/* Empty state — no runs at all */}
      {config.runs.length === 0 && (
        <section className="border rounded-lg overflow-hidden">
          <div className="text-center py-10">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No runs yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Link this reconciliation to a task and run it to see results here.
            </p>
          </div>
        </section>
      )}

      {/* Viewer Management Dialog */}
      <Dialog open={viewerDialogOpen} onOpenChange={setViewerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Manage Viewers — {config.name}</DialogTitle>
          </DialogHeader>
          <ViewerManagement
            entityType="reconciliations"
            entityId={config.id}
            viewers={viewers}
            onViewersChange={setViewers}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Reconciliation</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{config.name}&rdquo; and all its runs. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
