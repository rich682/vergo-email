"use client"

/**
 * DataGrid Header Component
 *
 * Sticky header row with:
 * - Column labels
 * - Excel-style filter dropdown per column
 * - Sort indicators
 */

import { useState, useCallback } from "react"
import type {
  ColumnDefinition,
  ColumnSort,
  ColumnFilter,
  DataGridHeaderProps,
  FilterOperator,
} from "@/lib/data-grid/types"
import { ChevronDown, ArrowUpAZ, ArrowDownAZ, Filter } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DataGridHeader({
  columns,
  sort,
  onSortChange,
  columnFilters,
  onColumnFilterChange,
  totalWidth,
}: DataGridHeaderProps) {
  const visibleColumns = columns.filter((c) => c.isVisible)

  return (
    <div
      className="flex bg-gray-100 border-b border-gray-300 sticky top-0 z-10"
      style={{ minWidth: totalWidth }}
    >
      {visibleColumns.map((column) => {
        const isActive = sort?.columnId === column.id
        const currentFilter = columnFilters.find((f) => f.columnId === column.id)

        return (
          <ColumnHeader
            key={column.id}
            column={column}
            sort={sort}
            isActive={isActive}
            currentFilter={currentFilter || null}
            onSortChange={onSortChange}
            onFilterChange={(filter) => onColumnFilterChange(filter, column.id)}
          />
        )
      })}
    </div>
  )
}

// ============================================
// Column Header with Filter Dropdown
// ============================================

interface ColumnHeaderProps {
  column: ColumnDefinition
  sort: ColumnSort | null
  isActive: boolean
  currentFilter: ColumnFilter | null
  onSortChange: (sort: ColumnSort | null) => void
  onFilterChange: (filter: ColumnFilter | null) => void
}

function ColumnHeader({
  column,
  sort,
  isActive,
  currentFilter,
  onSortChange,
  onFilterChange,
}: ColumnHeaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState(
    currentFilter?.value !== undefined ? String(currentFilter.value) : ""
  )

  const handleSortAsc = useCallback(() => {
    onSortChange({ columnId: column.id, direction: "asc" })
    setIsOpen(false)
  }, [column.id, onSortChange])

  const handleSortDesc = useCallback(() => {
    onSortChange({ columnId: column.id, direction: "desc" })
    setIsOpen(false)
  }, [column.id, onSortChange])

  const handleApplyFilter = useCallback(() => {
    if (!filterValue.trim()) {
      onFilterChange(null)
    } else {
      const operator = getDefaultOperator(column.dataType)
      const value = column.dataType === "number" || column.dataType === "currency"
        ? parseFloat(filterValue) || 0
        : filterValue
      onFilterChange({
        columnId: column.id,
        operator,
        value,
      })
    }
    setIsOpen(false)
  }, [column.id, column.dataType, filterValue, onFilterChange])

  const handleClearFilter = useCallback(() => {
    setFilterValue("")
    onFilterChange(null)
    setIsOpen(false)
  }, [onFilterChange])

  const hasFilter = currentFilter !== null

  return (
    <div
      className={`
        flex items-center justify-between
        px-2 py-2 
        text-xs font-medium text-gray-700 
        border-r border-gray-300 last:border-r-0
        select-none bg-gray-100
      `}
      style={{
        width: column.width ?? getDefaultWidth(column.dataType),
        minWidth: column.width ?? getDefaultWidth(column.dataType),
        flexShrink: 0,
      }}
    >
      <span className="truncate flex-1">
        {column.label}
      </span>
      
      {/* Filter dropdown trigger */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className={`
              ml-1 p-0.5 rounded hover:bg-gray-200 transition-colors
              ${hasFilter ? "text-blue-600" : "text-gray-400"}
              ${isActive ? "text-gray-700" : ""}
            `}
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-52 p-0" 
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-1">
            {/* Sort options */}
            {column.isSortable && (
              <>
                <button
                  className={`
                    w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded
                    hover:bg-gray-100 transition-colors text-left
                    ${isActive && sort?.direction === "asc" ? "bg-blue-50 text-blue-700" : ""}
                  `}
                  onClick={handleSortAsc}
                >
                  <ArrowUpAZ className="w-4 h-4" />
                  Sort A to Z
                </button>
                <button
                  className={`
                    w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded
                    hover:bg-gray-100 transition-colors text-left
                    ${isActive && sort?.direction === "desc" ? "bg-blue-50 text-blue-700" : ""}
                  `}
                  onClick={handleSortDesc}
                >
                  <ArrowDownAZ className="w-4 h-4" />
                  Sort Z to A
                </button>
                <div className="border-t border-gray-200 my-1" />
              </>
            )}
            
            {/* Filter section */}
            {column.isFilterable && (
              <div className="p-2">
                <div className="flex items-center gap-1 mb-2">
                  <Filter className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-600">Filter</span>
                  {hasFilter && (
                    <button
                      className="ml-auto text-xs text-gray-500 hover:text-gray-700"
                      onClick={handleClearFilter}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Input
                  type={column.dataType === "number" || column.dataType === "currency" ? "number" : "text"}
                  placeholder={getFilterPlaceholder(column.dataType)}
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="h-7 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleApplyFilter()
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="w-full mt-2 h-7 text-xs"
                  onClick={handleApplyFilter}
                >
                  Apply Filter
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ============================================
// Helpers
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

function getDefaultOperator(dataType: string): FilterOperator {
  switch (dataType) {
    case "number":
    case "currency":
      return "equals"
    case "date":
      return "on"
    case "boolean":
      return "is_true"
    default:
      return "contains"
  }
}

function getFilterPlaceholder(dataType: string): string {
  switch (dataType) {
    case "number":
    case "currency":
      return "Enter value..."
    case "date":
      return "YYYY-MM-DD"
    default:
      return "Contains..."
  }
}
