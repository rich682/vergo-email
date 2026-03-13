"use client"

import { useMemo } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "lucide-react"
import { format, isValid } from "date-fns"
import { parseDateOnlySafe } from "@/lib/utils/timezone"
import type {
  TargetDateRule,
  FrequencyType,
} from "@/lib/target-date-rules"
import {
  computeDueDateFromRule,
  describeTargetDateRule,
  getFrequencyFromRule,
  getOrdinalSuffix,
} from "@/lib/target-date-rules"

// ── Options ─────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

const DAY_OF_MONTH_OPTIONS = [
  ...Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}${getOrdinalSuffix(i + 1)}`,
  })),
  { value: "last", label: "Last day" },
]

const FREQUENCY_OPTIONS: { value: FrequencyType; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every other week" },
]

// ── Props ───────────────────────────────────────────────────────────

interface TargetDateRuleSelectorProps {
  value: TargetDateRule | null
  onChange: (rule: TargetDateRule) => void
  boardPeriodStart?: string | null
  boardPeriodEnd?: string | null
  compact?: boolean
  fallbackDateDisplay?: string | null // Display string for raw dueDate when no rule is set
}

// ── Component ───────────────────────────────────────────────────────

export function TargetDateRuleSelector({
  value,
  onChange,
  boardPeriodStart,
  boardPeriodEnd,
  compact = false,
  fallbackDateDisplay,
}: TargetDateRuleSelectorProps) {
  const frequency: FrequencyType = value ? getFrequencyFromRule(value) : "monthly"

  const computedDate = useMemo(() => {
    if (!value) return null
    const d = computeDueDateFromRule(value, boardPeriodStart, boardPeriodEnd)
    return isValid(d) ? d : null
  }, [value, boardPeriodStart, boardPeriodEnd])

  const handleFrequencyChange = (freq: FrequencyType) => {
    switch (freq) {
      case "monthly":
        onChange({ type: "day_of_month", day: 1 })
        break
      case "weekly":
        onChange({ type: "day_of_week", dayOfWeek: 5 }) // Default to Friday
        break
      case "biweekly": {
        // Anchor to next Friday from today
        const today = new Date()
        let anchor = new Date(today)
        while (anchor.getDay() !== 5) {
          anchor.setDate(anchor.getDate() + 1)
        }
        onChange({
          type: "biweekly",
          dayOfWeek: 5,
          anchorDate: anchor.toISOString().split("T")[0],
        })
        break
      }
    }
  }

  const handleDayOfMonthChange = (val: string) => {
    if (val === "last") {
      onChange({ type: "last_day_of_month" })
    } else {
      onChange({ type: "day_of_month", day: parseInt(val, 10) })
    }
  }

  const handleDayOfWeekChange = (val: string) => {
    const dayOfWeek = parseInt(val, 10)
    if (frequency === "biweekly") {
      // Keep existing anchor or create a new one
      const existingAnchor =
        value?.type === "biweekly" ? value.anchorDate : undefined
      let anchorDate = existingAnchor
      if (!anchorDate) {
        const today = new Date()
        let anchor = new Date(today)
        while (anchor.getDay() !== dayOfWeek) {
          anchor.setDate(anchor.getDate() + 1)
        }
        anchorDate = anchor.toISOString().split("T")[0]
      }
      onChange({ type: "biweekly", dayOfWeek, anchorDate })
    } else {
      onChange({ type: "day_of_week", dayOfWeek })
    }
  }

  // Current values for selects
  const dayOfMonthValue = (() => {
    if (!value) return "1"
    if (value.type === "last_day_of_month") return "last"
    if (value.type === "day_of_month") return String(value.day)
    return "1"
  })()

  const dayOfWeekValue = (() => {
    if (!value) return "5"
    if (value.type === "day_of_week") return String(value.dayOfWeek)
    if (value.type === "biweekly") return String(value.dayOfWeek)
    return "5"
  })()

  const selectorContent = (
    <div className={compact ? "space-y-3" : "space-y-3"}>
      {/* Frequency toggle */}
      <div>
        {!compact && <Label className="text-xs text-gray-500">Frequency</Label>}
        <div className={`flex gap-2 ${compact ? "" : "mt-1.5"}`}>
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                frequency === opt.value
                  ? "border-orange-500 bg-orange-50 text-orange-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
              onClick={() => handleFrequencyChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Day selector */}
      {frequency === "monthly" && (
        <div>
          <Label className="text-xs text-gray-500">Day of Month</Label>
          <Select value={dayOfMonthValue} onValueChange={handleDayOfMonthChange}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OF_MONTH_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(frequency === "weekly" || frequency === "biweekly") && (
        <div>
          <Label className="text-xs text-gray-500">Day of Week</Label>
          <Select value={dayOfWeekValue} onValueChange={handleDayOfWeekChange}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Preview */}
      {value && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
          {describeTargetDateRule(value)}
          {computedDate && (
            <span className="text-gray-700 font-medium">
              {" "}
              &rarr; {format(computedDate, "MMM d, yyyy")}
            </span>
          )}
        </div>
      )}
    </div>
  )

  // Compact mode: render as popover triggered by the date display
  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50 transition-colors group">
            <Calendar className="w-4 h-4 text-gray-400" />
            {computedDate ? (
              <span className="text-sm text-gray-700">
                {format(computedDate, "MMM d")}
              </span>
            ) : value ? (
              <span className="text-sm text-gray-500">
                {describeTargetDateRule(value)}
              </span>
            ) : fallbackDateDisplay ? (
              <span className="text-sm text-gray-700">{fallbackDateDisplay}</span>
            ) : (
              <span className="text-sm text-gray-400">Set date</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          {selectorContent}
        </PopoverContent>
      </Popover>
    )
  }

  // Full mode: render inline
  return selectorContent
}
