"use client"

/**
 * DataGrid Header Component
 *
 * Sticky header row with:
 * - Column labels
 * - Sort indicators (click to toggle)
 * - Filter trigger buttons
 */

import { useCallback } from "react"
import type {
  ColumnDefinition,
  ColumnSort,
  ColumnFilter,
  DataGridHeaderProps,
} from "@/lib/data-grid/types"
import { getAlignmentClass } from "./cell-renderers"
import { ChevronUp, ChevronDown, Filter } from "lucide-react"

export function DataGridHeader({
  columns,
  sort,
  onSortChange,
  columnFilters,
  onColumnFilterChange,
  totalWidth,
}: DataGridHeaderProps) {
  const handleSortClick = useCallback(
    (column: ColumnDefinition) => {
      if (!column.isSortable) return

      if (sort?.columnId === column.id) {
        // Cycle: asc -> desc -> none
        if (sort.direction === "asc") {
          onSortChange({ columnId: column.id, direction: "desc" })
        } else {
          onSortChange(null)
        }
      } else {
        onSortChange({ columnId: column.id, direction: "asc" })
      }
    },
    [sort, onSortChange]
  )

  const visibleColumns = columns.filter((c) => c.isVisible)

  return (
    <div
      className="flex bg-gray-50 border-b border-gray-200 sticky top-0 z-10"
      style={{ minWidth: totalWidth }}
    >
      {visibleColumns.map((column, index) => {
        const isActive = sort?.columnId === column.id
        const hasFilter = columnFilters.some((f) => f.columnId === column.id)
        const alignClass = getAlignmentClass(column.dataType)

        return (
          <div
            key={column.id}
            className={`
              flex items-center justify-between
              px-2 py-2 
              text-xs font-medium text-gray-600 
              border-r border-gray-200 last:border-r-0
              select-none
              ${column.isSortable ? "cursor-pointer hover:bg-gray-100" : ""}
              ${isActive ? "bg-gray-100" : ""}
            `}
            style={{
              width: column.width ?? getDefaultWidth(column.dataType),
              minWidth: column.width ?? getDefaultWidth(column.dataType),
              flexShrink: 0,
            }}
            onClick={() => handleSortClick(column)}
          >
            <span className={`truncate flex-1 ${alignClass}`}>
              {column.label}
            </span>
            <div className="flex items-center gap-0.5 ml-1">
              {hasFilter && (
                <Filter className="w-3 h-3 text-blue-500" />
              )}
              {column.isSortable && (
                <SortIndicator
                  direction={isActive ? sort.direction : null}
                  isActive={isActive}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================
// Sort Indicator
// ============================================

interface SortIndicatorProps {
  direction: "asc" | "desc" | null
  isActive: boolean
}

function SortIndicator({ direction, isActive }: SortIndicatorProps) {
  return (
    <div className="flex flex-col -space-y-1">
      <ChevronUp
        className={`w-3 h-3 ${
          isActive && direction === "asc"
            ? "text-gray-900"
            : "text-gray-300"
        }`}
      />
      <ChevronDown
        className={`w-3 h-3 ${
          isActive && direction === "desc"
            ? "text-gray-900"
            : "text-gray-300"
        }`}
      />
    </div>
  )
}

// ============================================
// Default Width Helper
// ============================================

function getDefaultWidth(dataType: string): number {
  switch (dataType) {
    case "boolean":
      return 80
    case "number":
    case "currency":
      return 120
    case "date":
      return 140
    case "text":
    default:
      return 180
  }
}
