"use client"

/**
 * Filter Popover Component
 *
 * Type-aware filter popover for individual columns.
 * Supports:
 * - Text: contains, equals, starts with, ends with
 * - Number/Currency: equals, gt, gte, lt, lte
 * - Date: on, before, after
 * - Boolean: is true, is false
 */

import { useState, useCallback } from "react"
import type {
  ColumnDefinition,
  ColumnFilter,
  FilterOperator,
  DataType,
} from "@/lib/data-grid/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Filter, X } from "lucide-react"

interface FilterPopoverProps {
  column: ColumnDefinition
  currentFilter: ColumnFilter | null
  onFilterChange: (filter: ColumnFilter | null) => void
}

export function FilterPopover({
  column,
  currentFilter,
  onFilterChange,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [operator, setOperator] = useState<FilterOperator>(
    currentFilter?.operator ?? getDefaultOperator(column.dataType)
  )
  const [value, setValue] = useState<string>(
    currentFilter?.value !== undefined ? String(currentFilter.value) : ""
  )

  const operators = getOperatorsForType(column.dataType)
  const needsValue = !["is_empty", "is_not_empty", "is_true", "is_false"].includes(
    operator
  )

  const handleApply = useCallback(() => {
    if (needsValue && !value.trim()) {
      onFilterChange(null)
    } else {
      const filterValue = convertValue(value, column.dataType)
      onFilterChange({
        columnId: column.id,
        operator,
        value: needsValue ? filterValue : undefined,
      })
    }
    setIsOpen(false)
  }, [column.id, column.dataType, operator, value, needsValue, onFilterChange])

  const handleClear = useCallback(() => {
    setValue("")
    setOperator(getDefaultOperator(column.dataType))
    onFilterChange(null)
    setIsOpen(false)
  }, [column.dataType, onFilterChange])

  const hasFilter = currentFilter !== null

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${hasFilter ? "text-blue-600" : "text-gray-400"}`}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Filter: {column.label}
            </span>
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-gray-500"
                onClick={handleClear}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Operator selector */}
          <Select value={operator} onValueChange={(v) => setOperator(v as FilterOperator)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operators.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Value input */}
          {needsValue && (
            <Input
              type={getInputType(column.dataType)}
              placeholder={getPlaceholder(column.dataType)}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleApply()
                }
              }}
            />
          )}

          {/* Apply button */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleApply}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ============================================
// Operator Definitions
// ============================================

interface OperatorOption {
  value: FilterOperator
  label: string
}

function getOperatorsForType(dataType: DataType): OperatorOption[] {
  switch (dataType) {
    case "text":
      return [
        { value: "contains", label: "Contains" },
        { value: "not_contains", label: "Does not contain" },
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Does not equal" },
        { value: "starts_with", label: "Starts with" },
        { value: "ends_with", label: "Ends with" },
        { value: "is_empty", label: "Is empty" },
        { value: "is_not_empty", label: "Is not empty" },
      ]

    case "number":
    case "currency":
      return [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Does not equal" },
        { value: "gt", label: "Greater than" },
        { value: "gte", label: "Greater than or equal" },
        { value: "lt", label: "Less than" },
        { value: "lte", label: "Less than or equal" },
        { value: "is_empty", label: "Is empty" },
        { value: "is_not_empty", label: "Is not empty" },
      ]

    case "date":
      return [
        { value: "on", label: "On" },
        { value: "before", label: "Before" },
        { value: "after", label: "After" },
        { value: "is_empty", label: "Is empty" },
        { value: "is_not_empty", label: "Is not empty" },
      ]

    case "boolean":
      return [
        { value: "is_true", label: "Is Yes" },
        { value: "is_false", label: "Is No" },
      ]

    default:
      return [
        { value: "contains", label: "Contains" },
        { value: "is_empty", label: "Is empty" },
      ]
  }
}

function getDefaultOperator(dataType: DataType): FilterOperator {
  switch (dataType) {
    case "boolean":
      return "is_true"
    case "number":
    case "currency":
      return "equals"
    case "date":
      return "on"
    default:
      return "contains"
  }
}

function getInputType(dataType: DataType): string {
  switch (dataType) {
    case "number":
    case "currency":
      return "number"
    case "date":
      return "date"
    default:
      return "text"
  }
}

function getPlaceholder(dataType: DataType): string {
  switch (dataType) {
    case "number":
      return "Enter number..."
    case "currency":
      return "Enter amount..."
    case "date":
      return "Select date..."
    default:
      return "Enter text..."
  }
}

function convertValue(
  value: string,
  dataType: DataType
): string | number | boolean {
  switch (dataType) {
    case "number":
    case "currency":
      return parseFloat(value) || 0
    default:
      return value
  }
}
