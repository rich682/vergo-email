"use client"

import { useState, useEffect, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface TaskBoard {
  id: string
  name: string
  periodStart: string | null
  periodEnd: string | null
  cadence: string | null
}

interface TaskOption {
  id: string
  name: string
  status: string
  taskType: string | null
  lineageId: string | null
  reconciliationConfigId: string | null
  hasDbRecipients: boolean
  board: TaskBoard | null
}

interface TaskLinkageStepProps {
  selectedTemplateId: string | null
  selectedTaskId: string | null
  onTaskSelect: (taskId: string, lineageId: string | null, taskType: string | null, taskName: string) => void
}

/** Map template IDs to the task types they should show */
const TEMPLATE_TASK_TYPE_MAP: Record<string, string[]> = {
  "send-standard-request": ["request"],
  "send-form": ["form"],
  "send-data-request": ["request"],
  "run-reconciliation": ["reconciliation"],
  "run-report": ["report"],
}

/** Templates that require DB recipients (data-personalized) */
const DB_RECIPIENT_TEMPLATES = new Set(["send-data-request"])
/** Templates that require non-DB recipients (standard) */
const STANDARD_RECIPIENT_TEMPLATES = new Set(["send-standard-request"])
/** Templates that require a recurring task (lineageId) for task_history recipients */
const REQUIRES_LINEAGE = new Set(["send-standard-request", "send-form"])

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  COMPLETE: "bg-emerald-100 text-emerald-700",
}

const TYPE_LABELS: Record<string, string> = {
  request: "Request",
  form: "Form",
  reconciliation: "Reconciliation",
  report: "Report",
}

export function TaskLinkageStep({
  selectedTemplateId,
  selectedTaskId,
  onTaskSelect,
}: TaskLinkageStepProps) {
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch("/api/task-instances/lineages")
      .then((res) => res.json())
      .then((data) => setTasks(data.tasks || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filteredTasks = useMemo(() => {
    if (!selectedTemplateId) return tasks
    const allowedTypes = TEMPLATE_TASK_TYPE_MAP[selectedTemplateId]
    if (!allowedTypes || allowedTypes.length === 0) return tasks

    let filtered = tasks.filter((t) => t.taskType && allowedTypes.includes(t.taskType))

    // For request-type templates, further filter by DB recipients
    if (DB_RECIPIENT_TEMPLATES.has(selectedTemplateId)) {
      filtered = filtered.filter((t) => t.hasDbRecipients)
    } else if (STANDARD_RECIPIENT_TEMPLATES.has(selectedTemplateId)) {
      filtered = filtered.filter((t) => !t.hasDbRecipients)
    }

    // For task_history-based templates, require a lineage (recurring task)
    if (REQUIRES_LINEAGE.has(selectedTemplateId)) {
      filtered = filtered.filter((t) => !!t.lineageId)
    }

    return filtered
  }, [tasks, selectedTemplateId])

  // Group tasks by board for display
  const groupedTasks = useMemo(() => {
    const groups: { boardName: string; boardPeriod: string | null; tasks: TaskOption[] }[] = []
    const boardMap = new Map<string, TaskOption[]>()
    const noBoardTasks: TaskOption[] = []

    for (const task of filteredTasks) {
      if (task.board) {
        const key = task.board.id
        if (!boardMap.has(key)) boardMap.set(key, [])
        boardMap.get(key)!.push(task)
      } else {
        noBoardTasks.push(task)
      }
    }

    for (const [, boardTasks] of boardMap) {
      const board = boardTasks[0].board!
      groups.push({
        boardName: board.name,
        boardPeriod: formatPeriod(board.periodStart, board.periodEnd),
        tasks: boardTasks,
      })
    }

    if (noBoardTasks.length > 0) {
      groups.push({
        boardName: "No board",
        boardPeriod: null,
        tasks: noBoardTasks,
      })
    }

    return groups
  }, [filteredTasks])

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Link to a task</h2>
      <p className="text-sm text-gray-500 mb-6">
        Select the task this agent will learn from. The agent will replicate the work you&apos;ve already done on this task for future periods.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading tasks...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">
            No matching tasks found.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {selectedTemplateId && REQUIRES_LINEAGE.has(selectedTemplateId)
              ? "This agent type requires a recurring task that repeats across periods. Create a recurring task first, then come back to set up automation."
              : "Create a task with the appropriate type first, then come back to set up automation."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedTasks.map((group) => (
            <div key={group.boardName}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-500">{group.boardName}</span>
                {group.boardPeriod && (
                  <span className="text-[10px] text-gray-400">{group.boardPeriod}</span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {group.tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      selectedTaskId === task.id
                        ? "border-orange-500 bg-orange-50/50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                    onClick={() => onTaskSelect(task.id, task.lineageId, task.taskType, task.name)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 truncate">{task.name}</h3>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${STATUS_COLORS[task.status] || "bg-gray-100 text-gray-600"}`}
                          >
                            {task.status.replace(/_/g, " ")}
                          </Badge>
                          {task.taskType && (
                            <Badge variant="outline" className="text-[10px]">
                              {TYPE_LABELS[task.taskType] || task.taskType}
                            </Badge>
                          )}
                          {task.lineageId && (
                            <span className="text-[10px] text-gray-400">Recurring</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatPeriod(start: string | null, end: string | null): string | null {
  if (!start) return null
  try {
    const startDate = new Date(start)
    const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" }
    if (end) {
      const endDate = new Date(end)
      return `${startDate.toLocaleDateString("en-US", opts)} – ${endDate.toLocaleDateString("en-US", opts)}`
    }
    return startDate.toLocaleDateString("en-US", opts)
  } catch {
    return null
  }
}
