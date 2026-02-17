"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronRight } from "lucide-react"

interface ScheduleConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export function ScheduleConfig({ params, onChange }: ScheduleConfigProps) {
  const [expanded, setExpanded] = useState(!!params.deadlineDate || !!(params.remindersConfig as any)?.enabled)

  const deadlineDate = (params.deadlineDate as string) || ""
  const remindersConfig = (params.remindersConfig as {
    enabled: boolean
    frequency: string
    stopCondition: string
  }) || { enabled: false, frequency: "weekly", stopCondition: "reply" }

  const setDeadline = (date: string) => {
    onChange({ ...params, deadlineDate: date || undefined })
  }

  const setReminders = (updates: Partial<typeof remindersConfig>) => {
    onChange({
      ...params,
      remindersConfig: { ...remindersConfig, ...updates },
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Schedule &amp; Reminders (optional)
      </button>

      {expanded && (
        <div className="space-y-3 pl-1">
          {/* Deadline */}
          <div>
            <Label className="text-xs text-gray-500">Deadline date</Label>
            <input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Reminders */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={remindersConfig.enabled}
                onChange={(e) => setReminders({ enabled: e.target.checked })}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-xs text-gray-700">Send follow-up reminders</span>
            </label>
          </div>

          {remindersConfig.enabled && (
            <div className="space-y-3 pl-4">
              <div>
                <Label className="text-xs text-gray-500">Frequency</Label>
                <Select
                  value={remindersConfig.frequency}
                  onValueChange={(v) => setReminders({ frequency: v })}
                >
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-gray-500">Stop reminders when</Label>
                <Select
                  value={remindersConfig.stopCondition}
                  onValueChange={(v) => setReminders({ stopCondition: v })}
                >
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reply">Recipient replies</SelectItem>
                    <SelectItem value="deadline">Deadline passes</SelectItem>
                    <SelectItem value="reply_or_deadline">Either reply or deadline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
