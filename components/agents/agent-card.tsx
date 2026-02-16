"use client"

import { Scale, FileBarChart, FileText, Send, Bot, Play, Settings, MoreHorizontal, Pause } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AgentCardProps {
  agent: {
    id: string
    name: string
    taskType: string | null
    description: string | null
    configId: string | null
    isActive: boolean
    createdAt: string
    executions?: Array<{
      id: string
      status: string
      completedAt: string | null
      createdAt: string
      outcome: any
    }>
    _count?: { executions: number; memories: number }
    createdBy?: { name: string | null } | null
  }
  onRun?: (id: string) => void
  onEdit?: (id: string) => void
  onPause?: (id: string) => void
  onDelete?: (id: string) => void
  onClick?: (id: string) => void
  canManage?: boolean
  canExecute?: boolean
}

const TYPE_CONFIG: Record<string, { icon: typeof Scale; label: string; color: string }> = {
  reconciliation: {
    icon: Scale,
    label: "Reconciliation",
    color: "text-emerald-600 bg-emerald-50",
  },
  report: {
    icon: FileBarChart,
    label: "Report",
    color: "text-blue-600 bg-blue-50",
  },
  form: {
    icon: FileText,
    label: "Form",
    color: "text-purple-600 bg-purple-50",
  },
  request: {
    icon: Send,
    label: "Request",
    color: "text-amber-600 bg-amber-50",
  },
}

const DEFAULT_TYPE = { icon: Bot, label: "Agent", color: "text-gray-600 bg-gray-100" }

function getRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHr / 24)

  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "success" | "warning" | "outline"; label: string }> = {
  running: { variant: "warning", label: "Running" },
  completed: { variant: "success", label: "Completed" },
  failed: { variant: "destructive", label: "Failed" },
  needs_review: { variant: "warning", label: "Needs Review" },
  cancelled: { variant: "secondary", label: "Cancelled" },
}

export function AgentCard({
  agent,
  onRun,
  onEdit,
  onPause,
  onDelete,
  onClick,
  canManage = false,
  canExecute = false,
}: AgentCardProps) {
  const typeConfig = (agent.taskType && TYPE_CONFIG[agent.taskType]) || DEFAULT_TYPE
  const TypeIcon = typeConfig.icon
  const lastExecution = agent.executions?.[0]
  const lastStatus = lastExecution ? STATUS_BADGE[lastExecution.status] || STATUS_BADGE.completed : null
  const isRunning = lastExecution?.status === "running"
  const matchRate = lastExecution?.outcome?.matchRate

  return (
    <div
      className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer bg-white"
      onClick={() => onClick?.(agent.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${typeConfig.color}`}>
            <TypeIcon className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-900 truncate">{agent.name}</h3>
              {!agent.isActive && (
                <Badge variant="secondary" className="text-[10px]">Paused</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {typeConfig.label} Agent
              {agent._count?.memories ? ` · ${agent._count.memories} memories` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canExecute && agent.isActive && !isRunning && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-gray-400 hover:text-orange-600"
              onClick={() => onRun?.(agent.id)}
            >
              <Play className="w-3.5 h-3.5" />
            </Button>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(agent.id)}>
                  <Settings className="w-3.5 h-3.5 mr-2" />
                  Edit Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPause?.(agent.id)}>
                  <Pause className="w-3.5 h-3.5 mr-2" />
                  {agent.isActive ? "Pause" : "Resume"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => onDelete?.(agent.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Last run status */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {lastStatus ? (
            <>
              <Badge variant={lastStatus.variant} className="text-[10px]">{lastStatus.label}</Badge>
              <span>{getRelativeTime(lastExecution?.completedAt || lastExecution?.createdAt || null)}</span>
            </>
          ) : (
            <span>No runs yet</span>
          )}
        </div>
        {matchRate !== undefined && matchRate !== null && (
          <span className="text-xs font-medium text-gray-900">{matchRate}% match rate</span>
        )}
      </div>
    </div>
  )
}
