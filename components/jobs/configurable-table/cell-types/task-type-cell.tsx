"use client"

import { Database, FileSpreadsheet, ClipboardList, FileBarChart, FileText } from "lucide-react"

// Task types - GENERIC, RECONCILIATION, TABLE, REPORTS are in the DB schema
// FORMS is frontend-only for now
export type TaskTypeValue = "GENERIC" | "RECONCILIATION" | "TABLE" | "REPORTS" | "FORMS"

interface TaskTypeCellProps {
  value: TaskTypeValue | undefined
}

const TYPE_CONFIG: Record<TaskTypeValue, { label: string; icon: typeof ClipboardList; bgColor: string; textColor: string }> = {
  GENERIC: {
    label: "Standard",
    icon: ClipboardList,
    bgColor: "bg-gray-100",
    textColor: "text-gray-700",
  },
  RECONCILIATION: {
    label: "Reconciliation",
    icon: FileSpreadsheet,
    bgColor: "bg-purple-100",
    textColor: "text-purple-700",
  },
  TABLE: {
    label: "Variance",
    icon: Database,
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
  },
  REPORTS: {
    label: "Report",
    icon: FileBarChart,
    bgColor: "bg-emerald-100",
    textColor: "text-emerald-700",
  },
  FORMS: {
    label: "Forms",
    icon: FileText,
    bgColor: "bg-amber-100",
    textColor: "text-amber-700",
  },
}

// Export for use in create form
export const TASK_TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([value, config]) => ({
  value: value as TaskTypeValue,
  label: config.label,
}))

export function TaskTypeCell({ value }: TaskTypeCellProps) {
  const typeValue = value || "GENERIC"
  const config = TYPE_CONFIG[typeValue] || TYPE_CONFIG.GENERIC
  const Icon = config.icon

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
    </div>
  )
}
