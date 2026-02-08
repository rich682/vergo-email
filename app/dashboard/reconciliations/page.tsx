"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Scale, ChevronRight, CheckCircle, AlertTriangle, Clock, Loader2, Plus, Search } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ReconciliationConfig {
  id: string
  name: string
  taskInstance: {
    id: string
    name: string
    board?: { id: string; name: string } | null
  }
  runs: {
    id: string
    status: string
    matchedCount: number
    exceptionCount: number
    variance: number
    createdAt: string
    completedAt: string | null
  }[]
  createdAt: string
}

interface TaskOption {
  id: string
  name: string
  board?: { id: string; name: string } | null
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  COMPLETE: { icon: <CheckCircle className="w-3.5 h-3.5" />, label: "Complete", color: "text-green-600 bg-green-50" },
  REVIEW: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Review", color: "text-amber-600 bg-amber-50" },
  PROCESSING: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: "Processing", color: "text-blue-600 bg-blue-50" },
  PENDING: { icon: <Clock className="w-3.5 h-3.5" />, label: "Pending", color: "text-gray-600 bg-gray-50" },
}

export default function ReconciliationsPage() {
  const router = useRouter()
  const [configs, setConfigs] = useState<ReconciliationConfig[]>([])
  const [loading, setLoading] = useState(true)

  // New reconciliation modal state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [taskSearch, setTaskSearch] = useState("")

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
        setLoading(false)
      }
    }
    fetchConfigs()
  }, [])

  // Fetch available tasks (excluding those that already have a reconciliation config)
  const fetchTasks = useCallback(async () => {
    try {
      setTasksLoading(true)
      const res = await fetch("/api/task-instances?limit=200", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        const allTasks: TaskOption[] = (data.taskInstances || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          board: t.board || null,
        }))
        // Exclude tasks that already have a reconciliation config
        const usedTaskIds = new Set(configs.map((c) => c.taskInstance.id))
        setTasks(allTasks.filter((t) => !usedTaskIds.has(t.id)))
      }
    } catch (err) {
      console.error("Failed to load tasks:", err)
    } finally {
      setTasksLoading(false)
    }
  }, [configs])

  // Fetch tasks when modal opens
  useEffect(() => {
    if (isNewModalOpen) {
      fetchTasks()
      setTaskSearch("")
    }
  }, [isNewModalOpen, fetchTasks])

  const filteredTasks = tasks.filter((t) => {
    if (!taskSearch) return true
    const q = taskSearch.toLowerCase()
    return t.name.toLowerCase().includes(q) || (t.board?.name?.toLowerCase().includes(q) ?? false)
  })

  const handleSelectTask = (taskId: string) => {
    setIsNewModalOpen(false)
    router.push(`/dashboard/jobs/${taskId}?tab=reconciliation`)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-normal text-gray-700">Reconciliations</h1>
          <p className="text-sm text-gray-500 mt-1">AI-powered reconciliation across your tasks</p>
        </div>
        <Button
          onClick={() => setIsNewModalOpen(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Reconciliation
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No reconciliations yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Create your first reconciliation by selecting a task, then upload two data sources to match.
          </p>
          <Button
            onClick={() => setIsNewModalOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Reconciliation
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 bg-gray-50 border-b text-xs font-medium text-gray-500 grid grid-cols-6 gap-4">
            <span className="col-span-2">Reconciliation</span>
            <span>Task</span>
            <span>Status</span>
            <span>Last Run</span>
            <span className="text-right">Variance</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {configs.map((config) => {
              const latestRun = config.runs?.[0]
              const statusInfo = latestRun
                ? STATUS_STYLES[latestRun.status] || STATUS_STYLES.PENDING
                : STATUS_STYLES.PENDING

              return (
                <Link
                  key={config.id}
                  href={`/dashboard/jobs/${config.taskInstance.id}?tab=reconciliation`}
                  className="px-4 py-3 grid grid-cols-6 gap-4 hover:bg-gray-50 transition-colors items-center"
                >
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-gray-900">{config.name}</p>
                    {config.taskInstance.board && (
                      <p className="text-xs text-gray-400">{config.taskInstance.board.name}</p>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate">{config.taskInstance.name}</p>
                  <div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.icon}
                      {statusInfo.label}
                    </span>
                  </div>
                  <div>
                    {latestRun ? (
                      <div>
                        <p className="text-xs text-gray-600">
                          {latestRun.matchedCount} matched, {latestRun.exceptionCount} exceptions
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {formatDistanceToNow(new Date(latestRun.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No runs yet</p>
                    )}
                  </div>
                  <div className="text-right flex items-center justify-end gap-2">
                    {latestRun ? (
                      <span className={`text-sm font-medium ${latestRun.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                        ${Math.abs(latestRun.variance).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* New Reconciliation Modal - Task Picker */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Reconciliation</DialogTitle>
            <DialogDescription>
              Select a task to set up a reconciliation. You&apos;ll upload two data sources and AI will detect columns and match transactions.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search tasks..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Task List */}
            <div className="max-h-[320px] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {tasksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">
                    {taskSearch ? "No matching tasks found" : "No available tasks"}
                  </p>
                  {!taskSearch && (
                    <p className="text-xs text-gray-400 mt-1">
                      All tasks already have reconciliations configured
                    </p>
                  )}
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleSelectTask(task.id)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                        {task.name}
                      </p>
                      {task.board && (
                        <p className="text-xs text-gray-400">{task.board.name}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400" />
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
