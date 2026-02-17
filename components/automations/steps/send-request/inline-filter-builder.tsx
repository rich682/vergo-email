"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Plus, X } from "lucide-react"

interface SchemaColumn {
  key: string
  label: string
  dataType: string
}

interface FilterRow {
  columnKey: string
  operator: string
  value?: unknown
}

const OPERATORS: { value: string; label: string; needsValue: boolean }[] = [
  { value: "eq", label: "equals", needsValue: true },
  { value: "neq", label: "does not equal", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "gt", label: "greater than", needsValue: true },
  { value: "lt", label: "less than", needsValue: true },
  { value: "gte", label: "at least", needsValue: true },
  { value: "lte", label: "at most", needsValue: true },
  { value: "not_empty", label: "is not empty", needsValue: false },
  { value: "is_empty", label: "is empty", needsValue: false },
]

interface InlineFilterBuilderProps {
  columns: SchemaColumn[]
  filters: FilterRow[]
  onChange: (filters: FilterRow[]) => void
}

export function InlineFilterBuilder({ columns, filters, onChange }: InlineFilterBuilderProps) {
  const addFilter = () => {
    onChange([...filters, { columnKey: columns[0]?.key || "", operator: "eq", value: "" }])
  }

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index))
  }

  const updateFilter = (index: number, updates: Partial<FilterRow>) => {
    const next = [...filters]
    next[index] = { ...next[index], ...updates }
    // Clear value if switching to an operator that doesn't need one
    const op = OPERATORS.find((o) => o.value === (updates.operator || next[index].operator))
    if (op && !op.needsValue) {
      next[index].value = undefined
    }
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500">Row filters (optional)</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addFilter}
          className="h-6 text-xs text-gray-500 hover:text-gray-700"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add filter
        </Button>
      </div>

      {filters.map((filter, i) => {
        const currentOp = OPERATORS.find((o) => o.value === filter.operator)
        return (
          <div key={i} className="flex items-center gap-1.5">
            {/* Column */}
            <Select
              value={filter.columnKey}
              onValueChange={(v) => updateFilter(i, { columnKey: v })}
            >
              <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator */}
            <Select
              value={filter.operator}
              onValueChange={(v) => updateFilter(i, { operator: v })}
            >
              <SelectTrigger className="h-8 text-xs w-[130px]">
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

            {/* Value */}
            {currentOp?.needsValue && (
              <input
                type="text"
                value={String(filter.value ?? "")}
                onChange={(e) => updateFilter(i, { value: e.target.value })}
                placeholder="value"
                className="h-8 flex-1 min-w-0 px-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            )}

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeFilter(i)}
              className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-red-500 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}

      {filters.length > 0 && (
        <p className="text-[10px] text-gray-400">
          All filters are combined with AND logic — rows must match every filter.
        </p>
      )}
    </div>
  )
}
