"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { describeSchedule, TIMEZONE_OPTIONS } from "@/lib/automations/cron-helpers"
import type { CronSchedule } from "@/lib/automations/types"

interface CronBuilderProps {
  schedule: CronSchedule
  onChange: (schedule: CronSchedule) => void
}

const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))

const MINUTE_OPTIONS = [
  { value: "0", label: "00" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
]

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}${getOrdinalSuffix(i + 1)}`,
}))

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

export function CronBuilder({ schedule, onChange }: CronBuilderProps) {
  const hour12 = schedule.hour % 12 || 12
  const ampm = schedule.hour >= 12 ? "PM" : "AM"

  const setHour = (h12: number, ap: string) => {
    let h24 = h12 % 12
    if (ap === "PM") h24 += 12
    onChange({ ...schedule, hour: h24 })
  }

  return (
    <div className="space-y-4">
      {/* Frequency */}
      <div>
        <Label className="text-xs text-gray-500">Frequency</Label>
        <div className="flex gap-2 mt-1.5">
          {(["daily", "weekly", "monthly"] as const).map((freq) => (
            <button
              key={freq}
              type="button"
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                schedule.frequency === freq
                  ? "border-orange-500 bg-orange-50 text-orange-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
              onClick={() => onChange({ ...schedule, frequency: freq })}
            >
              {freq.charAt(0).toUpperCase() + freq.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Day selector (weekly) */}
      {schedule.frequency === "weekly" && (
        <div>
          <Label className="text-xs text-gray-500">Day of Week</Label>
          <Select
            value={String(schedule.dayOfWeek?.[0] ?? 1)}
            onValueChange={(v) => onChange({ ...schedule, dayOfWeek: [parseInt(v)] })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Day selector (monthly) */}
      {schedule.frequency === "monthly" && (
        <div>
          <Label className="text-xs text-gray-500">Day of Month</Label>
          <Select
            value={String(schedule.dayOfMonth ?? 1)}
            onValueChange={(v) => onChange({ ...schedule, dayOfMonth: parseInt(v) })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OF_MONTH_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Time */}
      <div>
        <Label className="text-xs text-gray-500">Time</Label>
        <div className="flex items-center gap-2 mt-1">
          <Select value={String(hour12)} onValueChange={(v) => setHour(parseInt(v), ampm)}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map((h) => (
                <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-gray-400">:</span>
          <Select value={String(schedule.minute)} onValueChange={(v) => onChange({ ...schedule, minute: parseInt(v) })}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MINUTE_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ampm} onValueChange={(v) => setHour(hour12, v)}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AM">AM</SelectItem>
              <SelectItem value="PM">PM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Timezone */}
      <div>
        <Label className="text-xs text-gray-500">Timezone</Label>
        <Select value={schedule.timezone} onValueChange={(v) => onChange({ ...schedule, timezone: v })}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONE_OPTIONS.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600">
        {describeSchedule(schedule)}
      </div>
    </div>
  )
}
