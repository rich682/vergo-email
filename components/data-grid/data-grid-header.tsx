"use client"

/**
 * DataGrid Header Component
 *
 * Sticky header row with:
 * - Column labels
 * - Excel-style filter dropdown with checkboxes
 * - Sort options
 * - Three-dots menu for app columns (hide/delete)
 * - Add column button at far right
 */

import { useState, useCallback, useMemo } from "react"
import type {
  ColumnDefinition,
  ColumnSort,
  ColumnFilter,
  DataGridHeaderProps,
} from "@/lib/data-grid/types"
import { 
  ChevronDown, ArrowUpAZ, ArrowDownAZ, Check, Search,
  MoreHorizontal, EyeOff, Trash2, Edit2
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AddColumnButton, type AppColumnType } from "./add-column-button"

interface ExtendedDataGridHeaderProps extends DataGridHeaderProps {
  onAddColumn?: (type: AppColumnType, label: string) => Promise<void>
  onHideColumn?: (columnId: string) => void
  onDeleteColumn?: (columnId: string) => Promise<void>
  onRenameColumn?: (columnId: string, newLabel: string) => Promise<void>
  showAddColumn?: boolean
}

export function DataGridHeader({
  columns,
  sort,
  onSortChange,
  columnFilters,
  onColumnFilterChange,
  totalWidth,
  columnUniqueValues,
  onAddColumn,
  onHideColumn,
  onDeleteColumn,
  onRenameColumn,
  showAddColumn = false,
}: ExtendedDataGridHeaderProps) {
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
            onHideColumn={onHideColumn}
            onDeleteColumn={onDeleteColumn}
            onRenameColumn={onRenameColumn}
          />
        )
      })}
      
      {/* Add Column Button - inline at end */}
      {showAddColumn && onAddColumn && (
        <div
          className="flex items-center px-1 bg-gray-100"
          style={{ flexShrink: 0 }}
        >
          <AddColumnButton
            onAddColumn={onAddColumn}
            variant="header"
          />
        </div>
      )}
    </div>
  )
}

// ============================================
// Column Header with Filter & Actions
// ============================================

interface ColumnHeaderProps {
  column: ColumnDefinition
  sort: ColumnSort | null
  isActive: boolean
  currentFilter: ColumnFilter | null
  onSortChange: (sort: ColumnSort | null) => void
  onFilterChange: (filter: ColumnFilter | null) => void
  uniqueValues: string[]
  onHideColumn?: (columnId: string) => void
  onDeleteColumn?: (columnId: string) => Promise<void>
  onRenameColumn?: (columnId: string, newLabel: string) => Promise<void>
}

function ColumnHeader({
  column,
  sort,
  isActive,
  currentFilter,
  onSortChange,
  onFilterChange,
  uniqueValues,
  onHideColumn,
  onDeleteColumn,
  onRenameColumn,
}: ColumnHeaderProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Track selected values
  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    if (currentFilter?.operator === "in_values" && currentFilter.selectedValues) {
      return new Set(currentFilter.selectedValues)
    }
    return new Set([...uniqueValues, "__BLANK__"])
  })

  const handleFilterOpenChange = useCallback((open: boolean) => {
    setIsFilterOpen(open)
    if (open) {
      setSearchQuery("")
      if (currentFilter?.operator === "in_values" && currentFilter.selectedValues) {
        setSelectedValues(new Set(currentFilter.selectedValues))
      } else {
        setSelectedValues(new Set([...uniqueValues, "__BLANK__"]))
      }
    }
  }, [currentFilter, uniqueValues])

  const filteredValues = useMemo(() => {
    if (!searchQuery.trim()) return uniqueValues
    const query = searchQuery.toLowerCase()
    return uniqueValues.filter((v) => v.toLowerCase().includes(query))
  }, [uniqueValues, searchQuery])

  const handleSortAsc = useCallback(() => {
    onSortChange({ columnId: column.id, direction: "asc" })
    setIsFilterOpen(false)
  }, [column.id, onSortChange])

  const handleSortDesc = useCallback(() => {
    onSortChange({ columnId: column.id, direction: "desc" })
    setIsFilterOpen(false)
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
      onFilterChange(null)
    } else {
      onFilterChange({
        columnId: column.id,
        operator: "in_values",
        selectedValues: Array.from(selectedValues),
      })
    }
    setIsFilterOpen(false)
  }, [column.id, onFilterChange, selectedValues, uniqueValues])

  const handleClearFilter = useCallback(() => {
    setSelectedValues(new Set([...uniqueValues, "__BLANK__"]))
    onFilterChange(null)
    setIsFilterOpen(false)
  }, [onFilterChange, uniqueValues])

  const handleHide = useCallback(() => {
    onHideColumn?.(column.id)
    setIsActionsOpen(false)
  }, [column.id, onHideColumn])

  const handleDelete = useCallback(async () => {
    await onDeleteColumn?.(column.id)
    setIsActionsOpen(false)
  }, [column.id, onDeleteColumn])

  const hasFilter = currentFilter !== null
  const isAppColumn = column.kind === "app"
  const showActions = isAppColumn && (onHideColumn || onDeleteColumn)

  return (
    <div
      className={`
        group flex items-center justify-between
        px-2 py-2 
        text-xs font-medium text-gray-700 
        border-r border-gray-300 last:border-r-0
        select-none bg-gray-100
        hover:bg-gray-50
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
      
      <div className="flex items-center gap-0.5">
        {/* Three dots menu for app columns */}
        {showActions && (
          <Popover open={isActionsOpen} onOpenChange={setIsActionsOpen}>
            <PopoverTrigger asChild>
              <button
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4 text-gray-500" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="start">
              {onHideColumn && (
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-left"
                  onClick={handleHide}
                >
                  <EyeOff className="w-4 h-4 text-gray-500" />
                  Hide column
                </button>
              )}
              {onDeleteColumn && (
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-red-50 text-red-600 text-left"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete column
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* Filter dropdown */}
        <Popover open={isFilterOpen} onOpenChange={handleFilterOpenChange}>
          <PopoverTrigger asChild>
            <button
              className={`
                p-0.5 rounded hover:bg-gray-200 transition-colors
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

                  <div className="flex items-center justify-between mb-1 text-xs">
                    <button
                      className="text-gray-600 hover:text-gray-800"
                      onClick={handleSelectAll}
                    >
                      Select all
                    </button>
                    <button
                      className="text-gray-600 hover:text-gray-800"
                      onClick={handleClearAll}
                    >
                      Clear
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded">
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                      <Checkbox
                        checked={selectedValues.has("__BLANK__")}
                        onChange={() => handleToggleValue("__BLANK__")}
                      />
                      <span className="text-sm text-gray-500 italic">(Blanks)</span>
                    </label>

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

                  <Button
                    size="sm"
                    className="w-full mt-2 h-7 text-xs"
                    onClick={handleApplyFilter}
                  >
                    Apply Filter
                  </Button>
                </div>
              )}

              {column.isFilterable && uniqueValues.length === 0 && (
                <div className="p-4 text-sm text-gray-500 text-center">
                  No values to filter
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

// ============================================
// Checkbox Component
// ============================================

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
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
    case "attachment":
      return 140
    case "user":
      return 160
    case "status":
      return 140
    case "text":
    default:
      return 180
  }
}
