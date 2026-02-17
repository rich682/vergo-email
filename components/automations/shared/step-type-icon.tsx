"use client"

import {
  Send,
  ClipboardList,
  Scale,
  FileBarChart,
  Bot,
  ShieldCheck,
  GitBranch,
} from "lucide-react"

export interface StepTypeConfig {
  icon: typeof Send
  color: string
  bg: string
  label: string
}

export const STEP_TYPE_CONFIGS: Record<string, StepTypeConfig> = {
  // Action types
  send_request: { icon: Send, color: "text-amber-600", bg: "bg-amber-50", label: "Send Request" },
  send_form: { icon: ClipboardList, color: "text-purple-600", bg: "bg-purple-50", label: "Send Form" },
  complete_reconciliation: { icon: Scale, color: "text-emerald-600", bg: "bg-emerald-50", label: "Complete Reconciliation" },
  complete_report: { icon: FileBarChart, color: "text-blue-600", bg: "bg-blue-50", label: "Generate Report" },
  // Step types
  agent_run: { icon: Bot, color: "text-orange-600", bg: "bg-orange-50", label: "Run AI Agent" },
  human_approval: { icon: ShieldCheck, color: "text-rose-600", bg: "bg-rose-50", label: "Require Approval" },
  condition: { icon: GitBranch, color: "text-indigo-600", bg: "bg-indigo-50", label: "Add Condition" },
}

/**
 * Resolve the config key for a workflow step.
 * Actions use their actionType; other types use their step type.
 */
export function getStepConfigKey(type: string, actionType?: string): string {
  if (type === "action" && actionType) return actionType
  return type
}

interface StepTypeIconProps {
  type: string
  actionType?: string
  size?: "sm" | "md" | "lg"
}

export function StepTypeIcon({ type, actionType, size = "md" }: StepTypeIconProps) {
  const key = getStepConfigKey(type, actionType)
  const config = STEP_TYPE_CONFIGS[key] || { icon: GitBranch, color: "text-gray-600", bg: "bg-gray-100", label: "Step" }
  const Icon = config.icon

  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-10 h-10",
  }

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  }

  return (
    <div className={`${sizeClasses[size]} rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
      <Icon className={`${iconSizes[size]} ${config.color}`} />
    </div>
  )
}

interface StepTypeLabelProps {
  type: string
  actionType?: string
}

export function StepTypeLabel({ type, actionType }: StepTypeLabelProps) {
  const key = getStepConfigKey(type, actionType)
  const config = STEP_TYPE_CONFIGS[key]
  return <>{config?.label || type}</>
}
