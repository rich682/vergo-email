"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Scale, CheckCircle, AlertTriangle, Clock, Loader2, Plus, Users, Filter, Calendar, ExternalLink, Eye } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ViewerManagement, type Viewer } from "@/components/shared/viewer-management"
import { usePermissions } from "@/components/permissions-context"

interface ReconciliationConfig {
  id: string
  name: string
  _count: { taskInstances: number }
  runs: {
    id: string
    status: string
    matchedCount: number
    exceptionCount: number
    variance: number
    createdAt: string
    completedAt: string | null
  }[]
  viewers?: Array<{ user: { id: string; name: string | null; email: string } }>
  createdAt: string
}

interface CompletedReconRun {
  id: string
  configId: string
  boardId: string | null
  taskInstanceId: string | null
  status: "COMPLETE" | "REVIEW"
  sourceAFileName: string | null
  sourceBFileName: string | null
  totalSourceA: number
  totalSourceB: number
  matchedCount: number
  exceptionCount: number
  variance: number
  completedAt: string | null
  completedBy: string | null
  createdAt: string
  updatedAt: string
  config: {
    id: string
    name: string
  }
  taskInstance: {
    id: string
    name: string
    board: { id: string; name: string } | null
  } | null
  completedByUser: { id: string; name: string | null; email: string } | null
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  COMPLETE: { icon: <CheckCircle className="w-3.5 h-3.5" />, label: "Complete", color: "text-green-600 bg-green-50" },
  REVIEW: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Review", color: "text-amber-600 bg-amber-50" },
  PROCESSING: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: "Processing", color: "text-blue-600 bg-blue-50" },
  PENDING: { icon: <Clock className="w-3.5 h-3.5" />, label: "Pending", color: "text-gray-600 bg-gray-50" },
}

export default function ReconciliationsPage() {
  const router = useRouter()
  const { can } = usePermissions()
  const canManageReconciliations = can("reconciliations:manage")

  // Section 1: Config state
  const [configs, setConfigs] = useState<ReconciliationConfig[]>([])
  const [configsLoading, setConfigsLoading] = useState(true)
  const [viewerDialogConfig, setViewerDialogConfig] = useState<ReconciliationConfig | null>(null)
  const [viewerDialogViewers, setViewerDialogViewers] = useState<Viewer[]>([])

  // Section 2: Completed runs state
  const [completedRuns, setCompletedRuns] = useState<CompletedReconRun[]>([])
  const [completedLoading, setCompletedLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [periodFilter, setPeriodFilter] = useState<string>("all")

  // Reconciliation detail modal
  const [reconViewerOpen, setReconViewerOpen] = useState(false)
  const [viewingRecon, setViewingRecon] = useState<CompletedReconRun | null>(null)

  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const res = await fetch("/api/reconciliations")
        if (res.ok) {
          const data = await res.json()
          setConfigs(data.configs || [])
        }
      } catch (err) {
        console.error("Failed to load reconciliations:", err)
      } finally {
        setConfigsLoading(false)
      }
    }
    fetchConfigs()
  }, [])

  useEffect(() => {
    const fetchCompleted = async () => {
      try {
        const res = await fetch("/api/reconciliations/completed")
        if (res.ok) {
          const data = await res.json()
          setCompletedRuns(data.runs || [])
        }
      } catch (err) {
        console.error("Failed to load completed reconciliations:", err)
      } finally {
        setCompletedLoading(false)
      }
    }
    fetchCompleted()
  }, [])

  // Derive available periods from completed runs
  const availablePeriods = useMemo(() => {
    const periods = new Set<string>()
    for (const run of completedRuns) {
      const date = run.completedAt || run.createdAt
      periods.add(date.substring(0, 7)) // "YYYY-MM"
    }
    return [...periods].sort().reverse()
  }, [completedRuns])

  // Filter completed runs
  const filteredRuns = useMemo(() => {
    return completedRuns.filter(run => {
      if (statusFilter !== "all" && run.status !== statusFilter) return false
      if (periodFilter !== "all") {
        const runMonth = (run.completedAt || run.createdAt).substring(0, 7)
        if (runMonth !== periodFilter) return false
      }
      return true
    })
  }, [completedRuns, statusFilter, periodFilter])

  return (
    <div className="p-8 space-y-8">
      {/* ============================================ */}
      {/* SECTION 1: Reconciliation Builder (Admin Only) */}
      {/* ============================================ */}
      {canManageReconciliations && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reconciliation Builder</h2>
              <p className="text-sm text-gray-500">Create and manage reconciliation configurations</p>
            </div>
            <Link href="/dashboard/reconciliations/new">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="w-4 h-4 mr-2" />
                New Reconciliation
              </Button>
            </Link>
          </div>

          {configsLoading ? (
            <div className="flex items-center justify-center py-12 bg-white rounded-lg border border-gray-200">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-lg border border-gray-200">
              <Scale className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-medium text-gray-900 mb-1">No reconciliations yet</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
                Build your first reconciliation by uploading two data sources. AI will detect columns and configure matching rules.
              </p>
              <Link href="/dashboard/reconciliations/new">
                <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                  <Plus className="w-4 h-4 mr-2" />
                  New Reconciliation
                </Button>
              </Link>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Linked Tasks</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Viewers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {configs.map((config) => {
                    const latestRun = config.runs?.[0]
                    const statusInfo = latestRun
                      ? STATUS_STYLES[latestRun.status] || STATUS_STYLES.PENDING
                      : STATUS_STYLES.PENDING
                    const taskCount = config._count?.taskInstances ?? 0

                    return (
                      <tr
                        key={config.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/dashboard/reconciliations/${config.id}`)}
                      >
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900 text-sm">{config.name}</div>
                          <div className="text-xs text-gray-400">
                            Created {formatDistanceToNow(new Date(config.createdAt), { addSuffix: true })}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-sm text-gray-600">
                              {taskCount} {taskCount === 1 ? "task" : "tasks"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {latestRun ? (
                            <div>
                              <div className="text-xs text-gray-600">
                                {latestRun.matchedCount} matched, {latestRun.exceptionCount} exceptions
                              </div>
                              <div className="text-[10px] text-gray-400">
                                {formatDistanceToNow(new Date(latestRun.createdAt), { addSuffix: true })}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">No runs yet</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {latestRun ? (
                            <span className={`text-sm font-medium ${latestRun.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                              ${Math.abs(latestRun.variance).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-gray-500 hover:text-gray-700"
                            onClick={(e) => {
                              e.stopPropagation()
                              setViewerDialogConfig(config)
                              setViewerDialogViewers(
                                (config.viewers || []).map((v) => ({
                                  userId: v.user.id,
                                  name: v.user.name,
                                  email: v.user.email,
                                }))
                              )
                            }}
                          >
                            <Users className="w-3.5 h-3.5 mr-1" />
                            {config.viewers?.length || 0}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ============================================ */}
      {/* SECTION 2: Completed Reconciliations */}
      {/* ============================================ */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Completed Reconciliations</h2>
            <p className="text-sm text-gray-500">Reconciliation runs that are complete or in review</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-9">
                <Filter className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="COMPLETE">Complete</SelectItem>
                <SelectItem value="REVIEW">In Review</SelectItem>
              </SelectContent>
            </Select>
            {/* Period Filter */}
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {availablePeriods.map((period) => (
                  <SelectItem key={period} value={period}>
                    {period}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {completedLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mx-auto" />
                  </td>
                </tr>
              ) : filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Clock className="mx-auto h-8 w-8 text-gray-300" />
                    <p className="mt-2 text-sm text-gray-500">No completed reconciliations yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Run reconciliations from task pages to see completed runs here
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRuns.map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => { setViewingRecon(run); setReconViewerOpen(true) }}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900">
                          {run.config.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {run.status === "COMPLETE" ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Complete
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          In Review
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      <div className="flex items-center gap-3">
                        <span className="text-green-600 font-medium">{run.matchedCount} matched</span>
                        {run.exceptionCount > 0 && (
                          <span className="text-amber-600">{run.exceptionCount} exceptions</span>
                        )}
                        <span className={`font-medium ${run.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                          ${Math.abs(run.variance).toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {format(new Date(run.completedAt || run.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      <span onClick={(e) => e.stopPropagation()}>
                        {run.taskInstance ? (
                          <Link
                            href={`/dashboard/jobs/${run.taskInstance.id}?tab=reconciliation`}
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            {run.taskInstance.name}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-xs">No task linked</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="View Details"
                        onClick={() => { setViewingRecon(run); setReconViewerOpen(true) }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Viewer management dialog */}
      <Dialog
        open={!!viewerDialogConfig}
        onOpenChange={(open) => {
          if (!open) setViewerDialogConfig(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Manage Viewers — {viewerDialogConfig?.name}
            </DialogTitle>
          </DialogHeader>
          {viewerDialogConfig && (
            <ViewerManagement
              entityType="reconciliations"
              entityId={viewerDialogConfig.id}
              viewers={viewerDialogViewers}
              onViewersChange={(updated) => {
                setViewerDialogViewers(updated)
                setConfigs((prev) =>
                  prev.map((c) =>
                    c.id === viewerDialogConfig.id
                      ? {
                          ...c,
                          viewers: updated.map((v) => ({
                            user: { id: v.userId, name: v.name, email: v.email },
                          })),
                        }
                      : c
                  )
                )
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Reconciliation summary modal */}
      <Dialog open={reconViewerOpen} onOpenChange={(open) => !open && setReconViewerOpen(false)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-500" />
              {viewingRecon?.config.name || "Reconciliation"}
            </DialogTitle>
            <DialogDescription>
              {viewingRecon?.taskInstance?.board?.name && (
                <span>{viewingRecon.taskInstance.board.name} &bull; </span>
              )}
              {viewingRecon?.taskInstance?.name || "No task linked"}
            </DialogDescription>
          </DialogHeader>

          {viewingRecon && (
            <div className="space-y-5 py-2">
              {/* Status */}
              <div className="flex items-center gap-2">
                {viewingRecon.status === "COMPLETE" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-green-700 bg-green-50">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Complete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-amber-700 bg-amber-50">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    In Review
                  </span>
                )}
                {viewingRecon.completedAt && (
                  <span className="text-xs text-gray-500">
                    {format(new Date(viewingRecon.completedAt), "MMM d, yyyy h:mm a")}
                  </span>
                )}
                {viewingRecon.completedByUser && (
                  <span className="text-xs text-gray-500">
                    by {viewingRecon.completedByUser.name || viewingRecon.completedByUser.email}
                  </span>
                )}
              </div>

              {/* Source Files */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Source A</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{viewingRecon.sourceAFileName || "—"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{viewingRecon.totalSourceA} rows</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">Source B</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{viewingRecon.sourceBFileName || "—"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{viewingRecon.totalSourceB} rows</p>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center bg-green-50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-green-700">{viewingRecon.matchedCount}</p>
                  <p className="text-xs text-green-600 mt-0.5">Matched</p>
                </div>
                <div className="text-center bg-amber-50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-amber-700">{viewingRecon.exceptionCount}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Exceptions</p>
                </div>
                <div className={`text-center rounded-lg p-3 ${viewingRecon.variance === 0 ? "bg-green-50" : "bg-red-50"}`}>
                  <p className={`text-2xl font-semibold ${viewingRecon.variance === 0 ? "text-green-700" : "text-red-700"}`}>
                    ${Math.abs(viewingRecon.variance).toFixed(2)}
                  </p>
                  <p className={`text-xs mt-0.5 ${viewingRecon.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                    Variance
                  </p>
                </div>
              </div>

              {/* Link to full detail */}
              <div className="pt-2 border-t border-gray-200">
                <Link
                  href={viewingRecon.taskInstance ? `/dashboard/jobs/${viewingRecon.taskInstance.id}?tab=reconciliation` : `/dashboard/reconciliations/${viewingRecon.configId}`}
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  onClick={() => setReconViewerOpen(false)}
                >
                  View full reconciliation detail
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
