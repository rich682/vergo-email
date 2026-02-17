"use client"

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; dot?: string }> = {
  PENDING: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending", dot: "bg-gray-400" },
  RUNNING: { bg: "bg-blue-50", text: "text-blue-700", label: "Running", dot: "bg-blue-500" },
  WAITING_APPROVAL: { bg: "bg-orange-50", text: "text-orange-700", label: "Pending Approval", dot: "bg-orange-500" },
  COMPLETED: { bg: "bg-green-50", text: "text-green-700", label: "Completed", dot: "bg-green-500" },
  FAILED: { bg: "bg-red-50", text: "text-red-700", label: "Failed", dot: "bg-red-500" },
  CANCELLED: { bg: "bg-gray-100", text: "text-gray-500", label: "Cancelled", dot: "bg-gray-400" },
}

interface WorkflowRunStatusBadgeProps {
  status: string
  size?: "sm" | "md"
  showDot?: boolean
}

export function WorkflowRunStatusBadge({ status, size = "md", showDot = true }: WorkflowRunStatusBadgeProps) {
  const style = STATUS_STYLES[status] || {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: status,
    dot: "bg-gray-400",
  }

  const sizeClasses = size === "sm"
    ? "text-xs px-1.5 py-0.5"
    : "text-xs px-2 py-1"

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${sizeClasses}
        ${style.bg}
        ${style.text}
      `}
    >
      {showDot && style.dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${status === "RUNNING" ? "animate-pulse" : ""}`} />
      )}
      {style.label}
    </span>
  )
}
