"use client"

const TASK_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  reconciliation: { label: "Reconciliation", bg: "bg-emerald-100", text: "text-emerald-700" },
  report: { label: "Report", bg: "bg-blue-100", text: "text-blue-700" },
  form: { label: "Form", bg: "bg-purple-100", text: "text-purple-700" },
  request: { label: "Request", bg: "bg-amber-100", text: "text-amber-700" },
  analysis: { label: "Analysis", bg: "bg-cyan-100", text: "text-cyan-700" },
  other: { label: "Other", bg: "bg-gray-100", text: "text-gray-700" },
}

interface TaskTypeCellProps {
  value: string | null
  className?: string
}

export function TaskTypeCell({ value, className = "" }: TaskTypeCellProps) {
  if (!value) return <span className="text-sm text-gray-400">—</span>

  const config = TASK_TYPE_CONFIG[value] || { label: value, bg: "bg-gray-100", text: "text-gray-700" }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${config.bg} ${config.text} ${className}`}>
      {config.label}
    </span>
  )
}
