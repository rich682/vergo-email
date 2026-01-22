"use client"

/**
 * DataGrid Header Component
 *
 * Sticky header row with:
 * - Column labels
 * - Excel-style filter dropdown with checkboxes for value selection
 * - Sort options
 */

import { useState, useCallback, useMemo } from "react"
import type {
  ColumnDefinition,
  ColumnSort,
  ColumnFilter,
  DataGridHeaderProps,
} from "@/lib/data-grid/types"
import { ChevronDown, ArrowUpAZ, ArrowDownAZ, Check, Search } from "lucide-react"
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
  columnUniqueValues,
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
        const uniqueValues = columnUniqueValues?.find((uv) => uv.columnId === column.id)

        return (
          <ColumnHeader
            key={column.id}
            column={column}
            sort={sort}
            isActive={isActive}
            currentFilter={currentFilter || null}
            onSortChange={onSortChange}
            onFilterChange={(filter) => onColumnFilterChange(filter, column.id)}
            uniqueValues={uniqueValues?.values || []}
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
  uniqueValues: string[]
}

function ColumnHeader({
  column,
  sort,
  isActive,
  currentFilter,
  onSortChange,
  onFilterChange,
  uniqueValues,
}: ColumnHeaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Track selected values - initialize from current filter
  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    if (currentFilter?.operator === "in_values" && currentFilter.selectedValues) {
      return new Set(currentFilter.selectedValues)
    }
    // If no filter, all values are selected by default
    return new Set([...uniqueValues, "__BLANK__"])
  })

  // Reset selection when popover opens
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open)
    if (open) {
      setSearchQuery("")
      // Reset to current filter state
      if (currentFilter?.operator === "in_values" && currentFilter.selectedValues) {
        setSelectedValues(new Set(currentFilter.selectedValues))
      } else {
        setSelectedValues(new Set([...uniqueValues, "__BLANK__"]))
      }
    }
  }, [currentFilter, uniqueValues])

  // Filter values by search query
  const filteredValues = useMemo(() => {
    if (!searchQuery.trim()) return uniqueValues
    const query = searchQuery.toLowerCase()
    return uniqueValues.filter((v) => v.toLowerCase().includes(query))
  }, [uniqueValues, searchQuery])

  const handleSortAsc = useCallback(() => {
    onSortChange({ columnId: column.id, direction: "asc" })
    setIsOpen(false)
  }, [column.id, onSortChange])

  const handleSortDesc = useCallback(() => {
    onSortChange({ columnId: column.id, direction: "desc" })
    setIsOpen(false)
  }, [column.id, onSortChange])

  const handleToggleValue = useCallback((value: string) => {
    setSelectedValues((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedValues(new Set([...uniqueValues, "__BLANK__"]))
  }, [uniqueValues])

  const handleClearAll = useCallback(() => {
    setSelectedValues(new Set())
  }, [])

  const handleApplyFilter = useCallback(() => {
    const allValues = new Set([...uniqueValues, "__BLANK__"])
    const allSelected = selectedValues.size === allValues.size && 
      [...allValues].every((v) => selectedValues.has(v))

    if (allSelected || selectedValues.size === 0) {
      // All selected or none selected = no filter
      onFilterChange(null)
    } else {
      onFilterChange({
        columnId: column.id,
        operator: "in_values",
        selectedValues: Array.from(selectedValues),
      })
    }
    setIsOpen(false)
  }, [column.id, onFilterChange, selectedValues, uniqueValues])

  const handleClearFilter = useCallback(() => {
    setSelectedValues(new Set([...uniqueValues, "__BLANK__"]))
    onFilterChange(null)
    setIsOpen(false)
  }, [onFilterChange, uniqueValues])

  const hasFilter = currentFilter !== null
  const allSelected = selectedValues.size === uniqueValues.length + 1 // +1 for blanks
  const noneSelected = selectedValues.size === 0

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
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
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
          className="w-64 p-0" 
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
            {column.isFilterable && uniqueValues.length > 0 && (
              <div className="p-2">
                {/* Filter header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Filter by values</span>
                  {hasFilter && (
                    <button
                      className="text-xs text-blue-600 hover:text-blue-700"
                      onClick={handleClearFilter}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Search input */}
                {uniqueValues.length > 5 && (
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-7 text-sm pl-7"
                    />
                  </div>
                )}

                {/* Select All / Clear */}
                <div className="flex items-center justify-between mb-1 text-xs">
                  <button
                    className="text-gray-600 hover:text-gray-800"
                    onClick={handleSelectAll}
                  >
                    Select all {filteredValues.length}
                  </button>
                  <span className="text-gray-400">-</span>
                  <button
                    className="text-gray-600 hover:text-gray-800"
                    onClick={handleClearAll}
                  >
                    Clear
                  </button>
                </div>

                {/* Value checkboxes */}
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
                  {/* Blanks option */}
                  <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                    <Checkbox
                      checked={selectedValues.has("__BLANK__")}
                      onChange={() => handleToggleValue("__BLANK__")}
                    />
                    <span className="text-sm text-gray-500 italic">(Blanks)</span>
                  </label>

                  {/* Value options */}
                  {filteredValues.map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedValues.has(value)}
                        onChange={() => handleToggleValue(value)}
                      />
                      <span className="text-sm truncate" title={value}>
                        {value}
                      </span>
                    </label>
                  ))}

                  {filteredValues.length === 0 && searchQuery && (
                    <div className="px-2 py-3 text-sm text-gray-500 text-center">
                      No matching values
                    </div>
                  )}
                </div>

                {/* Apply button */}
                <Button
                  size="sm"
                  className="w-full mt-2 h-7 text-xs"
                  onClick={handleApplyFilter}
                >
                  Apply Filter
                </Button>
              </div>
            )}

            {/* Empty state for no values */}
            {column.isFilterable && uniqueValues.length === 0 && (
              <div className="p-4 text-sm text-gray-500 text-center">
                No values to filter
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ============================================
// Checkbox Component
// ============================================

interface CheckboxProps {
  checked: boolean
  onChange: () => void
}

function Checkbox({ checked, onChange }: CheckboxProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        onChange()
      }}
      className={`
        w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
        ${checked 
          ? "bg-blue-600 border-blue-600" 
          : "bg-white border-gray-300 hover:border-gray-400"
        }
      `}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </button>
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
