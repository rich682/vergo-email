"use client"

import { format, isValid } from "date-fns"
import { parseDateOnlySafe } from "@/lib/utils/timezone"
import { TargetDateRuleSelector } from "@/components/jobs/target-date-rule-selector"
import { isValidTargetDateRule } from "@/lib/target-date-rules"
import type { TargetDateRule } from "@/lib/target-date-rules"

interface DateCellProps {
  value: string | null // ISO date string (computed dueDate)
  targetDateRule?: Record<string, any> | null
  onRuleChange?: (rule: TargetDateRule) => void
  boardPeriodStart?: string | null
  boardPeriodEnd?: string | null
  className?: string
}

export function DateCell({
  value,
  targetDateRule,
  onRuleChange,
  boardPeriodStart,
  boardPeriodEnd,
  className = "",
}: DateCellProps) {
  // Use centralized date-only parsing to avoid timezone shift
  const parsedDate = parseDateOnlySafe(value)
  const isValidDate = parsedDate && isValid(parsedDate)
  const displayValue = isValidDate ? format(parsedDate, "MMM d") : null

  const currentRule =
    targetDateRule && isValidTargetDateRule(targetDateRule)
      ? (targetDateRule as TargetDateRule)
      : null

  // If we have a rule change handler, use the compact selector
  if (onRuleChange) {
    return (
      <div className={className}>
        <TargetDateRuleSelector
          value={currentRule}
          onChange={onRuleChange}
          boardPeriodStart={boardPeriodStart}
          boardPeriodEnd={boardPeriodEnd}
          compact
        />
      </div>
    )
  }

  // Read-only fallback: just display the date
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 text-sm text-gray-700 ${className}`}>
      {displayValue ? displayValue : <span className="text-gray-400">—</span>}
    </div>
  )
}
