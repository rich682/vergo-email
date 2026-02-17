"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ConditionOperator = "gt" | "lt" | "eq" | "gte" | "lte"

interface ConditionConfigProps {
  condition?: {
    field: string
    operator: string
    value: unknown
  }
  onTrue?: string
  onFalse?: string
  onChange: (updates: {
    condition?: { field: string; operator: ConditionOperator; value: unknown }
    onTrue?: string
    onFalse?: string
  }) => void
  stepLabels: { id: string; label: string }[]
}

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "gte", label: "at least" },
  { value: "lte", label: "at most" },
]

export function ConditionConfig({
  condition,
  onTrue,
  onFalse,
  onChange,
  stepLabels,
}: ConditionConfigProps) {
  const field = condition?.field || ""
  const operator = condition?.operator || "eq"
  const value = condition?.value ?? ""

  const updateCondition = (updates: Partial<{ field: string; operator: ConditionOperator; value: unknown }>) => {
    onChange({
      condition: {
        field: updates.field ?? field,
        operator: (updates.operator ?? operator) as ConditionOperator,
        value: updates.value ?? value,
      },
      onTrue,
      onFalse,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-gray-500">If</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            value={field}
            onChange={(e) => updateCondition({ field: e.target.value })}
            placeholder="e.g. steps.run_agent.matchRate"
            className="flex-1 text-sm"
          />
          <Select value={operator} onValueChange={(v) => updateCondition({ operator: v as ConditionOperator })}>
            <SelectTrigger className="w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={String(value)}
            onChange={(e) => {
              const num = Number(e.target.value)
              updateCondition({ value: isNaN(num) ? e.target.value : num })
            }}
            placeholder="value"
            className="w-24 text-sm"
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          Use dot notation to reference previous step results (e.g. steps.step_id.fieldName).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500">Then go to</Label>
          <Select
            value={onTrue || "__next__"}
            onValueChange={(v) => onChange({ condition: { field, operator: operator as ConditionOperator, value }, onTrue: v === "__next__" ? undefined : v, onFalse })}
          >
            <SelectTrigger className="mt-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__next__">Next step</SelectItem>
              {stepLabels.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-500">Otherwise go to</Label>
          <Select
            value={onFalse || "__stop__"}
            onValueChange={(v) => onChange({ condition: { field, operator: operator as ConditionOperator, value }, onTrue, onFalse: v === "__stop__" ? undefined : v })}
          >
            <SelectTrigger className="mt-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__stop__">Stop workflow</SelectItem>
              <SelectItem value="__next__">Next step</SelectItem>
              {stepLabels.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
