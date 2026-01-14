/**
 * SectionHeader - Section title with optional count and action
 * 
 * Usage:
 * <SectionHeader 
 *   title="Requests" 
 *   count={3}
 *   action={<Button size="sm">Add</Button>}
 *   collapsible
 *   expanded={expanded}
 *   onToggle={() => setExpanded(!expanded)}
 * />
 */

import { ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

interface SectionHeaderProps {
  title: string
  count?: number
  action?: ReactNode
  icon?: ReactNode
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
}

export function SectionHeader({
  title,
  count,
  action,
  icon,
  collapsible,
  expanded = true,
  onToggle,
}: SectionHeaderProps) {
  const HeaderContent = (
    <>
      <div className="flex items-center gap-2">
        {icon && <span className="text-gray-400">{icon}</span>}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {count !== undefined && (
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {action}
        {collapsible && (
          <span className="text-gray-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </div>
    </>
  )

  if (collapsible && onToggle) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
      >
        {HeaderContent}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between py-2">
      {HeaderContent}
    </div>
  )
}
