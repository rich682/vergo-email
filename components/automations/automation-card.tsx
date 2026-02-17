"use client"

import { Play, MoreHorizontal, Pause, Settings, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TriggerIcon, TriggerDescriptionText } from "./shared/trigger-description"
import { WorkflowRunStatusBadge } from "./shared/workflow-run-status-badge"
import type { AutomationRuleListItem } from "@/lib/automations/types"

interface AutomationCardProps {
  rule: AutomationRuleListItem
  onRun?: (id: string) => void
  onEdit?: (id: string) => void
  onPause?: (id: string) => void
  onDelete?: (id: string) => void
  onClick?: (id: string) => void
  canManage?: boolean
  canExecute?: boolean
}

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

function getStepCount(actions: Record<string, unknown>): number {
  const steps = (actions as any)?.steps
  return Array.isArray(steps) ? steps.length : 0
}

export function AutomationCard({
  rule,
  onRun,
  onEdit,
  onPause,
  onDelete,
  onClick,
  canManage = false,
  canExecute = false,
}: AutomationCardProps) {
  const isRunning = rule.lastRun?.status === "RUNNING"
  const isWaitingApproval = rule.lastRun?.status === "WAITING_APPROVAL"
  const stepCount = getStepCount(rule.actions)

  return (
    <div
      className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow cursor-pointer bg-white"
      onClick={() => onClick?.(rule.id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="relative">
            <TriggerIcon trigger={rule.trigger} size="md" />
            {isWaitingApproval && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-white" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-gray-900 truncate">{rule.name}</h3>
              {!rule.isActive && (
                <Badge variant="secondary" className="text-[10px]">Paused</Badge>
              )}
            </div>
            <TriggerDescriptionText
              trigger={rule.trigger}
              conditions={rule.conditions}
              className="text-xs text-gray-500 mt-0.5 line-clamp-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canExecute && rule.isActive && !isRunning && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-gray-400 hover:text-orange-600"
              onClick={() => onRun?.(rule.id)}
              title="Run now"
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
                <DropdownMenuItem onClick={() => onEdit?.(rule.id)}>
                  <Settings className="w-3.5 h-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPause?.(rule.id)}>
                  <Pause className="w-3.5 h-3.5 mr-2" />
                  {rule.isActive ? "Pause" : "Resume"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => onDelete?.(rule.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
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
          {rule.lastRun ? (
            <>
              <WorkflowRunStatusBadge status={rule.lastRun.status} size="sm" />
              <span>{getRelativeTime(rule.lastRun.completedAt || rule.lastRun.createdAt)}</span>
            </>
          ) : (
            <span>No runs yet</span>
          )}
        </div>
        {stepCount > 0 && (
          <span className="text-xs text-gray-400">
            {stepCount} step{stepCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  )
}
