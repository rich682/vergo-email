"use client"

import {
  Calendar,
  Clock,
  Database,
  Upload,
  ClipboardList,
} from "lucide-react"
import { getTriggerDescription, getTriggerShortLabel } from "@/lib/automations/trigger-labels"

const TRIGGER_ICONS: Record<string, { icon: typeof Calendar; color: string; bg: string }> = {
  board_created: { icon: Calendar, color: "text-blue-600", bg: "bg-blue-50" },
  board_status_changed: { icon: Calendar, color: "text-blue-600", bg: "bg-blue-50" },
  scheduled: { icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
  data_condition: { icon: Database, color: "text-emerald-600", bg: "bg-emerald-50" },
  data_uploaded: { icon: Upload, color: "text-emerald-600", bg: "bg-emerald-50" },
  form_submitted: { icon: ClipboardList, color: "text-amber-600", bg: "bg-amber-50" },
  compound: { icon: Clock, color: "text-indigo-600", bg: "bg-indigo-50" },
}

interface TriggerIconProps {
  trigger: string
  size?: "sm" | "md" | "lg"
}

export function TriggerIcon({ trigger, size = "md" }: TriggerIconProps) {
  const config = TRIGGER_ICONS[trigger] || { icon: Clock, color: "text-gray-600", bg: "bg-gray-100" }
  const Icon = config.icon

  const sizeClasses = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11",
  }

  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  }

  return (
    <div className={`${sizeClasses[size]} rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
      <Icon className={`${iconSizes[size]} ${config.color}`} />
    </div>
  )
}

interface TriggerDescriptionTextProps {
  trigger: string
  conditions?: Record<string, unknown> | null
  className?: string
}

export function TriggerDescriptionText({ trigger, conditions, className }: TriggerDescriptionTextProps) {
  return (
    <span className={className || "text-sm text-gray-500"}>
      {getTriggerDescription(trigger, conditions)}
    </span>
  )
}

interface TriggerBadgeProps {
  trigger: string
}

export function TriggerBadge({ trigger }: TriggerBadgeProps) {
  const config = TRIGGER_ICONS[trigger] || { color: "text-gray-600", bg: "bg-gray-100" }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
      {getTriggerShortLabel(trigger)}
    </span>
  )
}
