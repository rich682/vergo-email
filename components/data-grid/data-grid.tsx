"use client"

/**
 * DataGrid Component
 *
 * Virtualized data grid using @tanstack/react-virtual.
 * Features:
 * - Row virtualization for 10k+ rows
 * - Fixed 32px row height for dense Excel-style layout
 * - Sticky header
 * - Horizontal scroll for wide tables
 * - Excel-like borders (no gaps)
 */

import { useRef, useMemo, useCallback, useState, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type {
  DataGridProps,
  ColumnDefinition,
  GridFilterState,
  ColumnSort,
  ColumnFilter,
  SheetContext,
} from "@/lib/data-grid/types"
import {
  processRows,
  createEmptyFilterState,
  getDefaultColumnWidth,
} from "@/lib/data-grid/utils"
import { DataGridHeader } from "./data-grid-header"
import { CellRenderer, getAlignmentClass } from "./cell-renderers"
import { Loader2 } from "lucide-react"

// Constants
const ROW_HEIGHT = 32
const OVERSCAN = 5

export function DataGrid({
  columns,
  rows,
  resolver,
  sheet,
  initialFilterState,
  onFilterChange,
  onColumnVisibilityChange,
  isLoading = false,
  error = null,
}: DataGridProps) {
  // Container ref for virtualization
  const parentRef = useRef<HTMLDivElement>(null)

  // Filter state
  const [filterState, setFilterState] = useState<GridFilterState>(() => ({
    ...createEmptyFilterState(),
    ...initialFilterState,
  }))

  // Update filter state when it changes externally
  useEffect(() => {
    if (initialFilterState) {
      setFilterState((prev) => ({ ...prev, ...initialFilterState }))
    }
  }, [initialFilterState])

  // Visible columns
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.isVisible),
    [columns]
  )

  // Calculate total width for horizontal scroll
  const totalWidth = useMemo(() => {
    return visibleColumns.reduce((sum, col) => {
      return sum + (col.width ?? getDefaultColumnWidth(col.dataType))
    }, 0)
  }, [visibleColumns])

  // Process rows (filter + sort)
  const processedRows = useMemo(() => {
    return processRows(rows, columns, resolver, sheet, filterState)
  }, [rows, columns, resolver, sheet, filterState])

  // Row virtualizer
  const rowVirtualizer = useVirtualizer({
    count: processedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  // Handle sort change
  const handleSortChange = useCallback(
    (sort: ColumnSort | null) => {
      const newState = { ...filterState, sort }
      setFilterState(newState)
      onFilterChange?.(newState)
    },
    [filterState, onFilterChange]
  )

  // Handle column filter change
  const handleColumnFilterChange = useCallback(
    (filter: ColumnFilter | null, columnId: string) => {
      const newFilters = filterState.columnFilters.filter(
        (f) => f.columnId !== columnId
      )
      if (filter) {
        newFilters.push(filter)
      }
      const newState = { ...filterState, columnFilters: newFilters }
      setFilterState(newState)
      onFilterChange?.(newState)
    },
    [filterState, onFilterChange]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] bg-gray-50 border border-gray-200 rounded-lg">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
      </div>
    )
  }

  // Empty state
  if (processedRows.length === 0) {
    return (
      <div className="flex flex-col h-full border border-gray-200 rounded-lg overflow-hidden">
        <DataGridHeader
          columns={visibleColumns}
          sort={filterState.sort}
          onSortChange={handleSortChange}
          columnFilters={filterState.columnFilters}
          onColumnFilterChange={handleColumnFilterChange}
          totalWidth={totalWidth}
        />
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <p className="text-gray-500 text-sm">
            {filterState.globalSearch || filterState.columnFilters.length > 0
              ? "No rows match your filters"
              : "No data available"}
          </p>
        </div>
      </div>
    )
  }

  const virtualRows = rowVirtualizer.getVirtualItems()

  return (
    <div className="flex flex-col h-full min-h-[300px] border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Scrollable container for header + body */}
      <div className="flex-1 overflow-auto min-h-0">
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <DataGridHeader
            columns={visibleColumns}
            sort={filterState.sort}
            onSortChange={handleSortChange}
            columnFilters={filterState.columnFilters}
            onColumnFilterChange={handleColumnFilterChange}
            totalWidth={totalWidth}
          />
          
          {/* Body rows */}
          <div
            ref={parentRef}
            style={{ 
              height: `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`,
              position: "relative",
            }}
          >
            {virtualRows.map((virtualRow) => {
              const row = processedRows[virtualRow.index]
              const rowId = resolver.getRowId(row)

              return (
                <div
                  key={rowId || virtualRow.index}
                  className={`
                    flex absolute left-0 w-full
                    border-b border-gray-200
                    bg-white
                    hover:bg-blue-50
                  `}
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {visibleColumns.map((column) => {
                    const cellValue = resolver.getCellValue({
                      row,
                      column,
                      sheet,
                    })
                    const alignClass = getAlignmentClass(column.dataType)

                    return (
                      <div
                        key={column.id}
                        className={`
                          px-2 py-1 
                          border-r border-gray-200 last:border-r-0
                          flex items-center
                          ${alignClass}
                        `}
                        style={{
                          width: column.width ?? getDefaultColumnWidth(column.dataType),
                          minWidth: column.width ?? getDefaultColumnWidth(column.dataType),
                          flexShrink: 0,
                        }}
                      >
                        <CellRenderer value={cellValue} />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer with row count */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        <span>
          {processedRows.length.toLocaleString()} row{processedRows.length !== 1 ? "s" : ""}
          {rows.length !== processedRows.length && (
            <span className="text-gray-400">
              {" "}
              (filtered from {rows.length.toLocaleString()})
            </span>
          )}
        </span>
        <span>{visibleColumns.length} columns</span>
      </div>
    </div>
  )
}

// ============================================
// Controlled DataGrid variant
// ============================================

export interface ControlledDataGridProps extends Omit<DataGridProps, "initialFilterState"> {
  filterState: GridFilterState
}

/**
 * Controlled version of DataGrid where filter state is managed externally.
 */
export function ControlledDataGrid({
  filterState,
  onFilterChange,
  ...props
}: ControlledDataGridProps) {
  return (
    <DataGrid
      {...props}
      initialFilterState={filterState}
      onFilterChange={onFilterChange}
    />
  )
}
