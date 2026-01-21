"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Switch } from "@/components/ui/switch"
import { Filter, SlidersHorizontal, X } from "lucide-react"
import { RowDeltaType } from "./table-row"

export interface VarianceFilterState {
  deltaTypes: RowDeltaType[]
  thresholdType: "amount" | "percent" | null
  thresholdValue: number | null
  showUnchanged: boolean
  columnId: string | null // Filter by specific column
}

interface ColumnOption {
  id: string
  label: string
  type: string
}

interface VarianceFilterProps {
  filters: VarianceFilterState
  onFiltersChange: (filters: VarianceFilterState) => void
  comparableColumns: ColumnOption[]
  summary?: {
    addedCount: number
    changedCount: number
    removedCount: number
    unchangedCount: number
  }
}

const DEFAULT_FILTERS: VarianceFilterState = {
  deltaTypes: ["ADDED", "CHANGED"],
  thresholdType: null,
  thresholdValue: null,
  showUnchanged: false,
  columnId: null,
}

export function VarianceFilter({
  filters,
  onFiltersChange,
  comparableColumns,
  summary,
}: VarianceFilterProps) {
  const [isOpen, setIsOpen] = useState(false)

  const toggleDeltaType = (type: RowDeltaType) => {
    const current = filters.deltaTypes
    if (current.includes(type)) {
      // Don't allow removing all types
      if (current.length === 1) return
      onFiltersChange({
        ...filters,
        deltaTypes: current.filter((t) => t !== type),
      })
    } else {
      onFiltersChange({
        ...filters,
        deltaTypes: [...current, type],
      })
    }
  }

  const setThreshold = (type: "amount" | "percent" | null, value: number | null) => {
    onFiltersChange({
      ...filters,
      thresholdType: type,
      thresholdValue: value,
    })
  }

  const resetFilters = () => {
    onFiltersChange(DEFAULT_FILTERS)
  }

  const activeFilterCount =
    (filters.deltaTypes.length < 3 ? 1 : 0) +
    (filters.thresholdType ? 1 : 0) +
    (filters.columnId ? 1 : 0)

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Variance Filters</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-7 text-xs"
            >
              Reset
            </Button>
          </div>

          {/* Row type filters */}
          <div>
            <Label className="text-xs text-gray-500 mb-2 block">Show rows</Label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => toggleDeltaType("ADDED")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filters.deltaTypes.includes("ADDED")
                    ? "bg-green-100 text-green-700 border border-green-200"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                Added {summary && `(${summary.addedCount})`}
              </button>
              <button
                onClick={() => toggleDeltaType("CHANGED")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filters.deltaTypes.includes("CHANGED")
                    ? "bg-orange-100 text-orange-700 border border-orange-200"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                Changed {summary && `(${summary.changedCount})`}
              </button>
              <button
                onClick={() => toggleDeltaType("REMOVED")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filters.deltaTypes.includes("REMOVED")
                    ? "bg-red-100 text-red-700 border border-red-200"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                Removed {summary && `(${summary.removedCount})`}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Switch
                checked={filters.showUnchanged}
                onCheckedChange={(checked) =>
                  onFiltersChange({ ...filters, showUnchanged: checked })
                }
              />
              <span className="text-xs text-gray-600">
                Show unchanged {summary && `(${summary.unchangedCount})`}
              </span>
            </div>
          </div>

          {/* Threshold filter */}
          <div>
            <Label className="text-xs text-gray-500 mb-2 block">
              Minimum change threshold
            </Label>
            <div className="flex items-center gap-2">
              <Select
                value={filters.thresholdType || "none"}
                onValueChange={(v) =>
                  setThreshold(
                    v === "none" ? null : (v as "amount" | "percent"),
                    v === "none" ? null : filters.thresholdValue
                  )
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No filter</SelectItem>
                  <SelectItem value="amount">Amount ($)</SelectItem>
                  <SelectItem value="percent">Percent (%)</SelectItem>
                </SelectContent>
              </Select>
              {filters.thresholdType && (
                <Input
                  type="number"
                  value={filters.thresholdValue || ""}
                  onChange={(e) =>
                    setThreshold(
                      filters.thresholdType,
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  placeholder={filters.thresholdType === "amount" ? "100" : "5"}
                  className="w-24"
                />
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Hide changes smaller than this threshold
            </p>
          </div>

          {/* Column filter */}
          {comparableColumns.length > 1 && (
            <div>
              <Label className="text-xs text-gray-500 mb-2 block">
                Focus on column
              </Label>
              <Select
                value={filters.columnId || "all"}
                onValueChange={(v) =>
                  onFiltersChange({
                    ...filters,
                    columnId: v === "all" ? null : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All columns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All comparable columns</SelectItem>
                  {comparableColumns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Helper function to apply filters to rows
export function applyVarianceFilters(
  rows: any[],
  filters: VarianceFilterState
): any[] {
  return rows.filter((row) => {
    // Delta type filter
    const deltaType = row._deltaType as RowDeltaType
    if (deltaType === "UNCHANGED") {
      if (!filters.showUnchanged) return false
    } else if (!filters.deltaTypes.includes(deltaType)) {
      return false
    }

    // Threshold filter
    if (filters.thresholdType && filters.thresholdValue && row._changes) {
      const changes = Object.values(row._changes) as Array<{
        delta: number
        deltaPct: number
      }>

      // If filtering by specific column
      if (filters.columnId) {
        const change = row._changes[filters.columnId]
        if (!change) return true // No change in this column, include row

        const value =
          filters.thresholdType === "amount"
            ? Math.abs(change.delta)
            : Math.abs(change.deltaPct)

        return value >= filters.thresholdValue
      }

      // Check if any change exceeds threshold
      const hasSignificantChange = changes.some((change) => {
        const value =
          filters.thresholdType === "amount"
            ? Math.abs(change.delta)
            : Math.abs(change.deltaPct)
        return value >= (filters.thresholdValue || 0)
      })

      if (!hasSignificantChange) return false
    }

    return true
  })
}
