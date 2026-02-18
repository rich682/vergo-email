"use client"

import { useState, useEffect, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface TaskOption {
  id: string
  name: string
  status: string
  taskType: string | null
  lineageId: string | null
  reconciliationConfigId: string | null
}

interface TaskLinkageStepProps {
  selectedTemplateId: string | null
  selectedTaskId: string | null
  onTaskSelect: (taskId: string, lineageId: string | null, taskType: string | null, taskName: string) => void
}

/** Map template IDs to the task types they should show */
const TEMPLATE_TASK_TYPE_MAP: Record<string, string[]> = {
  "send-requests": ["request"],
  "send-forms": ["form"],
  "run-reconciliation": ["reconciliation"],
  "generate-report": ["report"],
  "custom": [], // Empty = show all
}

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
    return tasks.filter((t) => t.taskType && allowedTypes.includes(t.taskType))
  }, [tasks, selectedTemplateId])

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Link to a task</h2>
      <p className="text-sm text-gray-500 mb-6">
        Select the recurring task this agent will automate. The agent will replicate the work you&apos;ve already done on this task.
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
            Create a task with the appropriate type first, then come back to set up automation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filteredTasks.map((task) => (
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
      )}
    </div>
  )
}
