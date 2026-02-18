"use client"

import { useState, useEffect, useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CronBuilder } from "./cron-builder"
import { DatabaseConditionBuilder } from "./database-condition-builder"
import { cronToSchedule, scheduleToCron } from "@/lib/automations/cron-helpers"
import type { TriggerType, CronSchedule } from "@/lib/automations/types"
import { Calendar, Database, BarChart3, Clock } from "lucide-react"

interface TriggerConfigurationStepProps {
  name: string
  onNameChange: (name: string) => void
  triggerType: TriggerType
  onTriggerTypeChange: (type: TriggerType) => void
  conditions: Record<string, unknown>
  onConditionsChange: (conditions: Record<string, unknown>) => void
  allowedTriggers: string[]
}

// ── All available event triggers ────────────────────────────────────

interface EventTriggerOption {
  key: string
  label: string
  description: string
  icon: React.ReactNode
}

const ALL_EVENT_TRIGGERS: EventTriggerOption[] = [
  {
    key: "board_created",
    label: "Recurring board created",
    description: "Runs when a new period board is created for this task",
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    key: "board_status_changed",
    label: "Board completion",
    description: "Runs when a board is marked as complete",
    icon: <BarChart3 className="w-4 h-4" />,
  },
  {
    key: "database_update",
    label: "Database update",
    description: "Runs when database data changes (with optional settling window)",
    icon: <Database className="w-4 h-4" />,
  },
]

const BOARD_STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETE", label: "Complete" },
]

const DEFAULT_SCHEDULE: CronSchedule = {
  frequency: "monthly",
  dayOfMonth: 1,
  hour: 9,
  minute: 0,
  timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
}

// ── Component ────────────────────────────────────────────────────────────

export function TriggerConfigurationStep({
  name,
  onNameChange,
  triggerType,
  onTriggerTypeChange,
  conditions,
  onConditionsChange,
  allowedTriggers,
}: TriggerConfigurationStepProps) {
  // Filter event triggers based on what the template allows
  const eventTriggers = useMemo(
    () => ALL_EVENT_TRIGGERS.filter((t) => allowedTriggers.includes(t.key)),
    [allowedTriggers]
  )
  const scheduleAllowed = allowedTriggers.includes("scheduled")

  // Derive multi-trigger state from conditions
  const selectedEvents: string[] = (conditions._eventTriggers as string[]) || []
  const scheduleEnabled = !!(conditions._scheduleEnabled as boolean)
  const dbUpdateEnabled = selectedEvents.includes("database_update")

  const [schedule, setSchedule] = useState<CronSchedule>(() => {
    if (conditions.cronExpression) {
      return cronToSchedule(
        conditions.cronExpression as string,
        (conditions.timezone as string) || "UTC"
      ) || DEFAULT_SCHEDULE
    }
    return DEFAULT_SCHEDULE
  })

  // Sync cron expression when schedule changes
  const handleScheduleChange = (newSchedule: CronSchedule) => {
    setSchedule(newSchedule)
    onConditionsChange({
      ...conditions,
      cronExpression: scheduleToCron(newSchedule),
      timezone: newSchedule.timezone,
    })
  }

  // Initialize from legacy single-trigger when first mounting
  useEffect(() => {
    if (!conditions._eventTriggers && !conditions._scheduleEnabled) {
      if (triggerType === "scheduled" || triggerType === "compound") {
        onConditionsChange({
          ...conditions,
          _scheduleEnabled: true,
          _eventTriggers: triggerType === "compound" ? ["data_condition"] : [],
        })
      } else if ((triggerType as string) !== "compound") {
        onConditionsChange({
          ...conditions,
          _eventTriggers: [triggerType],
          _scheduleEnabled: false,
        })
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep triggerType in sync for the API — resolve effective type from selections
  useEffect(() => {
    // Map internal keys to API trigger types
    const apiEvents = selectedEvents
      .filter((e) => e !== "database_update")
      .map((e) => e as TriggerType)

    const hasDbUpdate = selectedEvents.includes("database_update")
    const hasMultipleConditions = apiEvents.length + (scheduleEnabled ? 1 : 0) + (hasDbUpdate ? 1 : 0) > 1

    let effective: TriggerType = "board_created"
    if (hasMultipleConditions) {
      effective = "compound"
    } else if (scheduleEnabled && hasDbUpdate) {
      effective = "compound"
    } else if (scheduleEnabled) {
      effective = "scheduled"
    } else if (hasDbUpdate) {
      effective = "data_condition"
    } else if (apiEvents.length === 1) {
      effective = apiEvents[0]
    }

    if (effective !== triggerType) {
      onTriggerTypeChange(effective)
    }
  }, [selectedEvents, scheduleEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEvent = (key: string) => {
    const next = selectedEvents.includes(key)
      ? selectedEvents.filter((e) => e !== key)
      : [...selectedEvents, key]

    const updated: Record<string, unknown> = { ...conditions, _eventTriggers: next }

    // When database_update is toggled off, clean up DB condition state
    if (key === "database_update" && selectedEvents.includes(key)) {
      delete updated.databaseCondition
      delete updated.settlingMinutes
    }
    // When database_update is toggled on, initialize DB condition
    if (key === "database_update" && !selectedEvents.includes(key)) {
      updated.databaseCondition = { databaseId: "", columnKey: "", operator: "eq", value: "" }
      updated.settlingMinutes = 60
    }

    onConditionsChange(updated)
  }

  const toggleSchedule = () => {
    const next = !scheduleEnabled
    const updated: Record<string, unknown> = { ...conditions, _scheduleEnabled: next }
    if (next && !conditions.cronExpression) {
      updated.cronExpression = scheduleToCron(schedule)
      updated.timezone = schedule.timezone
    }
    onConditionsChange(updated)
  }

  const nothingSelected = selectedEvents.length === 0 && !scheduleEnabled

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">Configure trigger</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose one or more conditions that will start this agent.
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

        {/* Event triggers — checkboxes */}
        <div>
          <Label className="text-xs text-gray-500 mb-2 block">Run when any of these happen:</Label>
          <div className="space-y-2">
            {eventTriggers.map((trigger) => {
              const checked = selectedEvents.includes(trigger.key)
              return (
                <div key={trigger.key}>
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? "border-orange-300 bg-orange-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEvent(trigger.key)}
                      className="mt-0.5 rounded accent-orange-500"
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`flex-shrink-0 ${checked ? "text-orange-500" : "text-gray-400"}`}>
                        {trigger.icon}
                      </span>
                      <div>
                        <span className="text-sm font-medium text-gray-800">{trigger.label}</span>
                        <p className="text-xs text-gray-400 mt-0.5">{trigger.description}</p>
                      </div>
                    </div>
                  </label>

                  {/* Board status sub-config */}
                  {trigger.key === "board_status_changed" && checked && (
                    <div className="ml-10 mt-2 mb-1">
                      <Label className="text-xs text-gray-500">Target Status</Label>
                      <Select
                        value={(conditions.targetStatus as string) || "COMPLETE"}
                        onValueChange={(v) => onConditionsChange({ ...conditions, targetStatus: v })}
                      >
                        <SelectTrigger className="mt-1 w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BOARD_STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Database update sub-config: condition builder + settling window */}
                  {trigger.key === "database_update" && checked && (
                    <div className="ml-10 mt-3 space-y-3">
                      <div className="p-3 border border-gray-100 rounded-lg bg-gray-50/50">
                        <DatabaseConditionBuilder
                          condition={(conditions.databaseCondition as any) || { databaseId: "", columnKey: "", operator: "eq", value: "" }}
                          onChange={(dc) => onConditionsChange({ ...conditions, databaseCondition: dc })}
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-gray-500">Settling Window (minutes)</Label>
                        <Input
                          type="number"
                          min={0}
                          className="mt-1 w-32"
                          value={(conditions.settlingMinutes as number) ?? 60}
                          onChange={(e) =>
                            onConditionsChange({
                              ...conditions,
                              settlingMinutes: Math.max(0, parseInt(e.target.value) || 0),
                            })
                          }
                        />
                        <p className="text-[10px] text-gray-400 mt-1">
                          Wait this many minutes after the last data change before running. Set to 0 to run immediately.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Schedule toggle */}
        {scheduleAllowed && (
          <div>
            <label
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                scheduleEnabled
                  ? "border-orange-300 bg-orange-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={toggleSchedule}
                className="mt-0.5 rounded accent-orange-500"
              />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`flex-shrink-0 ${scheduleEnabled ? "text-orange-500" : "text-gray-400"}`}>
                  <Clock className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-sm font-medium text-gray-800">Cron schedule</span>
                  <p className="text-xs text-gray-400 mt-0.5">Runs at a recurring time (daily, weekly, or monthly)</p>
                </div>
              </div>
            </label>

            {scheduleEnabled && (
              <div className="ml-10 mt-3 p-3 border border-gray-100 rounded-lg bg-gray-50/50">
                <CronBuilder schedule={schedule} onChange={handleScheduleChange} />
              </div>
            )}
          </div>
        )}

        {/* Validation hint */}
        {nothingSelected && (
          <p className="text-xs text-amber-600">Select at least one trigger to continue.</p>
        )}
      </div>
    </div>
  )
}
