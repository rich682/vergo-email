"use client"

/**
 * DataGrid Toolbar Component
 *
 * Contains:
 * - Global search (debounced 150ms)
 * - Sheet/snapshot selector dropdown
 * - Column visibility toggle
 */

import { useState, useCallback, useEffect, useMemo } from "react"
import type {
  DataGridToolbarProps,
  GridFilterState,
  SheetContext,
  ColumnDefinition,
} from "@/lib/data-grid/types"
import { debounce } from "@/lib/data-grid/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Search, Columns, Eye, EyeOff, Check } from "lucide-react"
import { format } from "date-fns"

export function DataGridToolbar({
  filterState,
  onFilterChange,
  columns,
  onColumnVisibilityChange,
  sheets,
  currentSheet,
  onSheetChange,
}: DataGridToolbarProps) {
  // Local search input state (for immediate feedback)
  const [searchInput, setSearchInput] = useState(filterState.globalSearch)

  // Debounced search handler
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        onFilterChange({ ...filterState, globalSearch: value })
      }, 150),
    [filterState, onFilterChange]
  )

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setSearchInput(value)
      debouncedSearch(value)
    },
    [debouncedSearch]
  )

  // Sync search input when filterState changes externally
  useEffect(() => {
    setSearchInput(filterState.globalSearch)
  }, [filterState.globalSearch])

  // Handle sheet change
  const handleSheetChange = useCallback(
    (snapshotId: string) => {
      onSheetChange({ kind: "snapshot", snapshotId })
    },
    [onSheetChange]
  )

  // Get current sheet ID for selector
  const currentSheetId =
    currentSheet.kind === "snapshot" ? currentSheet.snapshotId : ""

  // Count visible columns
  const visibleCount = columns.filter((c) => c.isVisible).length

  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      {/* Left side: Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search all columns..."
          value={searchInput}
          onChange={handleSearchChange}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Right side: Sheet selector + Column visibility */}
      <div className="flex items-center gap-2">
        {/* Sheet/Snapshot selector */}
        {sheets.length > 1 && (
          <Select value={currentSheetId} onValueChange={handleSheetChange}>
            <SelectTrigger className="h-8 w-[180px] text-sm">
              <SelectValue placeholder="Select snapshot" />
            </SelectTrigger>
            <SelectContent>
              {sheets.map((sheet) => (
                <SelectItem key={sheet.id} value={sheet.id}>
                  <div className="flex items-center gap-2">
                    <span className="truncate">
                      {sheet.periodLabel ||
                        format(new Date(sheet.createdAt), "MMM d, yyyy")}
                    </span>
                    {sheet.isLatest && (
                      <span className="text-xs text-green-600 font-medium">
                        Latest
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Column visibility toggle */}
        <ColumnVisibilityPopover
          columns={columns}
          onColumnVisibilityChange={onColumnVisibilityChange}
          visibleCount={visibleCount}
        />
      </div>
    </div>
  )
}

// ============================================
// Column Visibility Popover
// ============================================

interface ColumnVisibilityPopoverProps {
  columns: ColumnDefinition[]
  onColumnVisibilityChange: (columnId: string, isVisible: boolean) => void
  visibleCount: number
}

function ColumnVisibilityPopover({
  columns,
  onColumnVisibilityChange,
  visibleCount,
}: ColumnVisibilityPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleToggle = useCallback(
    (column: ColumnDefinition) => {
      // Prevent hiding last visible column
      if (column.isVisible && visibleCount <= 1) return
      onColumnVisibilityChange(column.id, !column.isVisible)
    },
    [onColumnVisibilityChange, visibleCount]
  )

  const handleShowAll = useCallback(() => {
    columns.forEach((col) => {
      if (!col.isVisible) {
        onColumnVisibilityChange(col.id, true)
      }
    })
  }, [columns, onColumnVisibilityChange])

  const allVisible = columns.every((c) => c.isVisible)

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Columns className="w-4 h-4" />
          <span className="text-xs">
            {visibleCount}/{columns.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-gray-500">Columns</span>
            {!allVisible && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-xs"
                onClick={handleShowAll}
              >
                Show all
              </Button>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {columns.map((column) => (
              <button
                key={column.id}
                onClick={() => handleToggle(column)}
                className={`
                  w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded
                  hover:bg-gray-100 transition-colors
                  ${column.isVisible ? "text-gray-900" : "text-gray-400"}
                `}
              >
                {column.isVisible ? (
                  <Eye className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span className="truncate flex-1 text-left">{column.label}</span>
                {column.isVisible && (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
