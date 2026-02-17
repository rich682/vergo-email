"use client"

import { useState, useEffect } from "react"
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
import { TriggerIcon } from "../shared/trigger-description"
import { cronToSchedule, scheduleToCron } from "@/lib/automations/cron-helpers"
import type { TriggerType, CronSchedule } from "@/lib/automations/types"

interface TriggerConfigurationStepProps {
  name: string
  onNameChange: (name: string) => void
  triggerType: TriggerType
  onTriggerTypeChange: (type: TriggerType) => void
  conditions: Record<string, unknown>
  onConditionsChange: (conditions: Record<string, unknown>) => void
  isCustom: boolean
}

const TRIGGER_OPTIONS: { value: TriggerType; label: string }[] = [
  { value: "board_created", label: "When a new period board is created" },
  { value: "board_status_changed", label: "When a board status changes" },
  { value: "scheduled", label: "On a schedule" },
  { value: "data_uploaded", label: "When reconciliation data is uploaded" },
  { value: "form_submitted", label: "When a form is submitted" },
  { value: "data_condition", label: "When data meets a condition" },
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
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
}

export function TriggerConfigurationStep({
  name,
  onNameChange,
  triggerType,
  onTriggerTypeChange,
  conditions,
  onConditionsChange,
  isCustom,
}: TriggerConfigurationStepProps) {
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

        {/* Trigger type (only for custom) */}
        {isCustom && (
          <div>
            <Label className="text-xs text-gray-500">Trigger Type</Label>
            <Select value={triggerType} onValueChange={(v) => onTriggerTypeChange(v as TriggerType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Trigger-specific config */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <TriggerIcon trigger={triggerType} size="sm" />
            <span className="text-sm font-medium text-gray-700">
              {TRIGGER_OPTIONS.find((o) => o.value === triggerType)?.label || triggerType}
            </span>
          </div>

          {triggerType === "scheduled" && (
            <CronBuilder schedule={schedule} onChange={handleScheduleChange} />
          )}

          {triggerType === "board_status_changed" && (
            <div>
              <Label className="text-xs text-gray-500">Target Status</Label>
              <Select
                value={(conditions.targetStatus as string) || "COMPLETE"}
                onValueChange={(v) => onConditionsChange({ ...conditions, targetStatus: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOARD_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-400 mt-1">
                The agent will run when a board transitions to this status.
              </p>
            </div>
          )}

          {triggerType === "board_created" && (
            <p className="text-sm text-gray-500">
              This agent will run automatically whenever a new period board is created in your organization.
            </p>
          )}

          {triggerType === "data_uploaded" && (
            <p className="text-sm text-gray-500">
              This agent will run when new reconciliation data is matched and uploaded.
            </p>
          )}

          {triggerType === "form_submitted" && (
            <p className="text-sm text-gray-500">
              This agent will run when a form response is submitted.
            </p>
          )}

          {triggerType === "data_condition" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-3">
                Configure a data condition that will be checked periodically.
              </p>
              <div>
                <Label className="text-xs text-gray-500">Database ID</Label>
                <Input
                  value={(conditions.databaseId as string) || ""}
                  onChange={(e) => onConditionsChange({ ...conditions, databaseId: e.target.value })}
                  placeholder="Database ID"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Column Key</Label>
                <Input
                  value={(conditions.columnKey as string) || ""}
                  onChange={(e) => onConditionsChange({ ...conditions, columnKey: e.target.value })}
                  placeholder="e.g. posting_date"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Operator</Label>
                <Select
                  value={(conditions.operator as string) || "eq"}
                  onValueChange={(v) => onConditionsChange({ ...conditions, operator: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eq">Equals</SelectItem>
                    <SelectItem value="between">Between</SelectItem>
                    <SelectItem value="gt">Greater than</SelectItem>
                    <SelectItem value="lt">Less than</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
