"use client"

import { Database, FileSpreadsheet, ClipboardList } from "lucide-react"

interface TaskTypeCellProps {
  value: "GENERIC" | "RECONCILIATION" | "TABLE" | undefined
}

const TYPE_CONFIG = {
  GENERIC: {
    label: "Generic",
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
}

export function TaskTypeCell({ value }: TaskTypeCellProps) {
  const config = TYPE_CONFIG[value || "GENERIC"]
  const Icon = config.icon

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
    </div>
  )
}
