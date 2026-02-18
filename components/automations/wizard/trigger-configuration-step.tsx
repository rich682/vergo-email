"use client"

import { useState, useEffect } from "react"
import { Clock, Database } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { CronBuilder } from "./cron-builder"
import { cronToSchedule, scheduleToCron } from "@/lib/automations/cron-helpers"
import type { TriggerType, CronSchedule } from "@/lib/automations/types"

/** Template categories that have database linkage */
const DATABASE_LINKED_TEMPLATES = new Set([
  "run-reconciliation",
  "generate-report",
  "custom",
])

interface TriggerConfigurationStepProps {
  name: string
  onNameChange: (name: string) => void
  triggerType: TriggerType
  onTriggerTypeChange: (type: TriggerType) => void
  conditions: Record<string, unknown>
  onConditionsChange: (conditions: Record<string, unknown>) => void
  templateId?: string | null
}

const DEFAULT_SCHEDULE: CronSchedule = {
  frequency: "monthly",
  dayOfMonth: 1,
  hour: 9,
  minute: 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
}

export function TriggerConfigurationStep({
  name,
  onNameChange,
  triggerType,
  onTriggerTypeChange,
  conditions,
  onConditionsChange,
  templateId,
}: TriggerConfigurationStepProps) {
  const showDatabaseOption = DATABASE_LINKED_TEMPLATES.has(templateId || "")

  const [schedule, setSchedule] = useState<CronSchedule>(() => {
    if (triggerType === "scheduled" && conditions.cronExpression) {
      return cronToSchedule(
        conditions.cronExpression as string,
        (conditions.timezone as string) || "UTC"
      ) || DEFAULT_SCHEDULE
    }
    return DEFAULT_SCHEDULE
  })

  const handleScheduleChange = (newSchedule: CronSchedule) => {
    setSchedule(newSchedule)
    onConditionsChange({
      ...conditions,
      cronExpression: scheduleToCron(newSchedule),
      timezone: newSchedule.timezone,
    })
  }

  // Initialize cron when switching to scheduled trigger
  useEffect(() => {
    if (triggerType === "scheduled" && !conditions.cronExpression) {
      onConditionsChange({
        ...conditions,
        cronExpression: scheduleToCron(schedule),
        timezone: schedule.timezone,
      })
    }
  }, [triggerType])

  const handleTriggerSelect = (type: TriggerType) => {
    onTriggerTypeChange(type)
    // Reset conditions when switching trigger type
    if (type === "scheduled") {
      onConditionsChange({
        cronExpression: scheduleToCron(schedule),
        timezone: schedule.timezone,
      })
    } else {
      onConditionsChange({})
    }
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Configure trigger</h2>
      <p className="text-sm text-gray-500 mb-6">
        Set when this agent should run.
      </p>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <Label className="text-xs text-gray-500">Agent Name</Label>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="My Agent"
            className="mt-1"
          />
        </div>

        {/* Trigger type — card selector */}
        <div>
          <Label className="text-xs text-gray-500">When should this agent run?</Label>
          <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: showDatabaseOption ? "1fr 1fr" : "1fr" }}>
            {/* Time-based */}
            <button
              type="button"
              onClick={() => handleTriggerSelect("scheduled")}
              className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 text-left transition-colors ${
                triggerType === "scheduled"
                  ? "border-orange-400 bg-orange-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                triggerType === "scheduled" ? "bg-orange-100" : "bg-purple-50"
              }`}>
                <Clock className={`w-4 h-4 ${
                  triggerType === "scheduled" ? "text-orange-600" : "text-purple-600"
                }`} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Time-based</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Run on a recurring schedule
                </div>
              </div>
            </button>

            {/* Database update — only for templates with database linkage */}
            {showDatabaseOption && (
              <button
                type="button"
                onClick={() => handleTriggerSelect("database_changed")}
                className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 text-left transition-colors ${
                  triggerType === "database_changed"
                    ? "border-orange-400 bg-orange-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  triggerType === "database_changed" ? "bg-orange-100" : "bg-emerald-50"
                }`}>
                  <Database className={`w-4 h-4 ${
                    triggerType === "database_changed" ? "text-orange-600" : "text-emerald-600"
                  }`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Database update</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Run when linked data changes
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Trigger-specific config */}
        {triggerType === "scheduled" && (
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Schedule</span>
            </div>
            <CronBuilder schedule={schedule} onChange={handleScheduleChange} />
          </div>
        )}

        {triggerType === "database_changed" && (
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Database update</span>
            </div>
            <p className="text-sm text-gray-500">
              This agent will run automatically whenever the linked dataset is updated &mdash; for example, when new rows are added or existing data is modified.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              The dataset linkage is determined by the task selected in the previous step.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
