"use client"

/**
 * DataGrid Component
 *
 * Virtualized data grid using @tanstack/react-virtual.
 * Features:
 * - Row virtualization for 10k+ rows
 * - Fixed 32px row height for dense Excel-style layout
 * - Sticky header with add column button
 * - Interactive cells for app columns
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
  ColumnUniqueValues,
  CellValue,
  AppRowDefinition,
} from "@/lib/data-grid/types"
import {
  processRows,
  createEmptyFilterState,
  getDefaultColumnWidth,
  extractColumnUniqueValues,
} from "@/lib/data-grid/utils"
import { DataGridHeader } from "./data-grid-header"
import { CellRenderer, getAlignmentClass } from "./cell-renderers"
import { AddRowButton, type AppRowType } from "./add-row-button"
import { SheetTabBar } from "./sheet-tab-bar"
import { Loader2, Trash2, FunctionSquare, Edit2 } from "lucide-react"
import type { AppColumnType } from "./add-column-button"
import { 
  evaluateRowFormula, 
  buildFormulaContext, 
  columnToLetter,
  parseCellFormula,
  evaluateCellFormula,
  buildCellEvalContext,
} from "@/lib/formula"
import type { FormulaDefinition } from "@/lib/formula"
import { FormulaCellEditor, FormulaCellDisplay } from "./cell-editors/formula-cell"

// Cell formula type
export interface CellFormulaData {
  cellRef: string
  formula: string
  evaluatedValue?: number | string
}

// Constants
const ROW_HEIGHT = 36
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
  onAddColumn,
  onHideColumn,
  onDeleteColumn,
  onRenameColumn,
  onCellValueChange,
  identityKey,
  showAddColumn = false,
  appRows = [],
  onAddRow,
  onDeleteRow,
  onRenameRow,
  onRowCellValueChange,
  showAddRow = false,
  sheets = [],
  onSheetChange,
  onAddSheet,
  canAddSheet = false,
  onFormulaColumnSelect,
  onFormulaRowSelect,
  onEditFormulaColumn,
  onEditFormulaRow,
  formulaColumns,
  // Cell formula props (Excel-style)
  cellFormulas,
  onCellFormulaChange,
}: DataGridProps & { 
  onDeleteRow?: (rowId: string) => Promise<void>
  onEditFormulaColumn?: (columnId: string) => void
  onEditFormulaRow?: (rowId: string) => void
  formulaColumns?: Map<string, { expression: string; resultType: string; label: string }>
  // Cell formula props (Excel-style)
  cellFormulas?: Map<string, CellFormulaData>  // cellRef -> formula data
  onCellFormulaChange?: (cellRef: string, formula: string | null) => Promise<void>
}) {
  // Container ref for virtualization
  const parentRef = useRef<HTMLDivElement>(null)

  // Filter state
  const [filterState, setFilterState] = useState<GridFilterState>(() => ({
    ...createEmptyFilterState(),
    ...initialFilterState,
  }))

  // Formula editing state (for click-to-select cell references)
  const [formulaEditingCell, setFormulaEditingCell] = useState<string | null>(null)
  const [isInFormulaMode, setIsInFormulaMode] = useState(false)
  const formulaEditorRef = useRef<import("./cell-editors/formula-cell").FormulaCellEditorRef | null>(null)

  // Handler for when a cell is clicked while in formula editing mode
  const handleCellClickForReference = useCallback((clickedCellRef: string) => {
    if (isInFormulaMode && formulaEditorRef.current) {
      formulaEditorRef.current.insertCellRef(clickedCellRef)
    }
  }, [isInFormulaMode])

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

  // Extract unique values for each column (for value-based filtering)
  const columnUniqueValues = useMemo<ColumnUniqueValues[]>(() => {
    return visibleColumns
      .filter((col) => col.isFilterable)
      .map((col) => {
        const { values } = extractColumnUniqueValues(rows, col, resolver, sheet)
        return {
          columnId: col.id,
          values,
        }
      })
  }, [rows, visibleColumns, resolver, sheet])

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

  // Handle add column
  const handleAddColumn = useCallback(async (type: AppColumnType, label: string) => {
    if (onAddColumn) {
      await onAddColumn(type, label)
    }
  }, [onAddColumn])

  // Handle hide column
  const handleHideColumn = useCallback((columnId: string) => {
    if (onHideColumn) {
      onHideColumn(columnId)
    } else if (onColumnVisibilityChange) {
      onColumnVisibilityChange(columnId, false)
    }
  }, [onHideColumn, onColumnVisibilityChange])

  // Handle delete column
  const handleDeleteColumn = useCallback(async (columnId: string) => {
    if (onDeleteColumn) {
      await onDeleteColumn(columnId)
    }
  }, [onDeleteColumn])

  // Handle add row
  const handleAddRow = useCallback(async (type: AppRowType, label: string) => {
    if (onAddRow) {
      await onAddRow(type, label)
    }
  }, [onAddRow])

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
          columnUniqueValues={columnUniqueValues}
          onHideColumn={handleHideColumn}
          onDeleteColumn={handleDeleteColumn}
          onRenameColumn={onRenameColumn}
          showAddColumn={showAddColumn}
          onFormulaSelect={onFormulaColumnSelect}
          onEditFormulaColumn={onEditFormulaColumn}
          formulaColumns={formulaColumns}
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
  const gridWidth = showAddColumn ? totalWidth + 60 : totalWidth

  return (
    <div className="flex flex-col h-full min-h-[300px] border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Scrollable container for header + body */}
      <div className="flex-1 overflow-auto min-h-0">
        <div style={{ minWidth: gridWidth }}>
          {/* Header */}
          <DataGridHeader
            columns={visibleColumns}
            sort={filterState.sort}
            onSortChange={handleSortChange}
            columnFilters={filterState.columnFilters}
            onColumnFilterChange={handleColumnFilterChange}
            totalWidth={totalWidth}
            columnUniqueValues={columnUniqueValues}
            onHideColumn={handleHideColumn}
            onDeleteColumn={handleDeleteColumn}
            onRenameColumn={onRenameColumn}
            showAddColumn={showAddColumn}
            onFormulaSelect={onFormulaColumnSelect}
            onEditFormulaColumn={onEditFormulaColumn}
            formulaColumns={formulaColumns}
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
              const rowIdentity = identityKey ? String(row[identityKey] || "") : rowId

              return (
                <div
                  key={rowId || virtualRow.index}
                  className={`
                    flex absolute left-0 w-full
                    border-b border-gray-200
                    bg-white
                    hover:bg-blue-50/50
                  `}
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {visibleColumns.map((column, colIndex) => {
                    const cellValue = resolver.getCellValue({
                      row,
                      column,
                      sheet,
                    })
                    const isAppColumn = column.kind === "app"
                    const columnId = column.id.replace("app_", "")
                    const isFirstColumn = colIndex === 0
                    // Calculate cell reference (A1 style) - row is 1-indexed in Excel
                    const cellRef = `${columnToLetter(colIndex)}${virtualRow.index + 1}`
                    const cellFormulaData = cellFormulas?.get(cellRef)
                    
                    return (
                      <DataGridCell
                        key={column.id}
                        column={column}
                        cellValue={cellValue}
                        isAppColumn={isAppColumn}
                        columnId={columnId}
                        rowIdentity={rowIdentity}
                        onCellValueChange={onCellValueChange}
                        isFirstColumn={isFirstColumn}
                        cellRef={cellRef}
                        cellFormula={cellFormulaData}
                        onCellFormulaChange={onCellFormulaChange}
                        allRows={rows}
                        allColumns={visibleColumns}
                        currentRowIndex={virtualRow.index}
                        isFormulaEditingActive={isInFormulaMode}
                        onCellClickForReference={handleCellClickForReference}
                        onStartFormulaEdit={(ref) => setFormulaEditingCell(ref)}
                        onEndFormulaEdit={() => { setFormulaEditingCell(null); setIsInFormulaMode(false) }}
                        onFormulaModeChange={setIsInFormulaMode}
                        formulaEditorRef={formulaEditorRef}
                      />
                    )
                  })}
                  
                  {/* Empty cell for add column - matches header */}
                  {showAddColumn && (
                    <div
                      className="border-r border-gray-200 bg-white"
                      style={{ width: 60, minWidth: 60, flexShrink: 0 }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          
          {/* App Rows (custom rows at bottom) */}
          {appRows.length > 0 && (
            <div className="border-t-2 border-gray-300">
              {appRows.map((appRow, appRowIndex) => (
                <AppRowComponent
                  key={appRow.id}
                  appRow={appRow}
                  appRowIndex={appRowIndex}
                  totalDataRows={processedRows.length}
                  visibleColumns={visibleColumns}
                  showAddColumn={showAddColumn}
                  identityKey={identityKey}
                  formulaColumns={formulaColumns}
                  onRowCellValueChange={onRowCellValueChange}
                  onDeleteRow={onDeleteRow}
                  onRenameRow={onRenameRow}
                  onEditFormulaRow={onEditFormulaRow}
                  allRows={rows}
                  allColumns={columns}
                  cellFormulas={cellFormulas}
                  onCellFormulaChange={onCellFormulaChange}
                  isFormulaEditingActive={isInFormulaMode}
                  onCellClickForReference={handleCellClickForReference}
                  onStartFormulaEdit={(ref) => setFormulaEditingCell(ref)}
                  onEndFormulaEdit={() => { setFormulaEditingCell(null); setIsInFormulaMode(false) }}
                  onFormulaModeChange={setIsInFormulaMode}
                  formulaEditorRef={formulaEditorRef}
                />
              ))}
            </div>
          )}
          
          {/* Add Row Button */}
          {showAddRow && onFormulaRowSelect && (
            <div className="p-2 border-t border-gray-200 bg-gray-50">
              <AddRowButton
                onFormulaSelect={onFormulaRowSelect}
                disabled={isLoading}
              />
            </div>
          )}
        </div>
      </div>

      {/* Sheet Tab Bar (Excel-like tabs at bottom) */}
      {(sheets.length > 1 || canAddSheet) && onSheetChange && (
        <SheetTabBar
          sheets={sheets}
          currentSheet={sheet}
          onSheetChange={onSheetChange}
          onAddSheet={onAddSheet}
          canAddSheet={canAddSheet}
        />
      )}

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
          {appRows.length > 0 && (
            <span className="text-gray-400">
              {" "}+ {appRows.length} custom row{appRows.length !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span>{visibleColumns.length} columns</span>
      </div>
    </div>
  )
}

// ============================================
// App Row Component (custom rows at bottom)
// ============================================

interface AppRowComponentProps {
  appRow: AppRowDefinition
  appRowIndex: number
  totalDataRows: number
  visibleColumns: ColumnDefinition[]
  showAddColumn: boolean
  identityKey?: string
  formulaColumns?: Map<string, { expression: string; resultType: string; label: string }>
  onRowCellValueChange?: (rowId: string, columnKey: string, value: string | null) => Promise<void>
  onDeleteRow?: (rowId: string) => Promise<void>
  onRenameRow?: (rowId: string, newLabel: string) => Promise<void>
  onEditFormulaRow?: (rowId: string) => void
  allRows: Record<string, unknown>[]
  allColumns: ColumnDefinition[]
  // Cell formula props
  cellFormulas?: Map<string, CellFormulaData>
  onCellFormulaChange?: (cellRef: string, formula: string | null) => Promise<void>
  isFormulaEditingActive?: boolean
  onCellClickForReference?: (cellRef: string) => void
  onStartFormulaEdit?: (cellRef: string) => void
  onEndFormulaEdit?: () => void
  onFormulaModeChange?: (isFormulaMode: boolean) => void
  formulaEditorRef?: React.MutableRefObject<import("./cell-editors/formula-cell").FormulaCellEditorRef | null>
}

function AppRowComponent({
  appRow,
  appRowIndex,
  totalDataRows,
  visibleColumns,
  showAddColumn,
  identityKey,
  formulaColumns,
  onRowCellValueChange,
  onDeleteRow,
  onRenameRow,
  onEditFormulaRow,
  allRows,
  allColumns,
  cellFormulas,
  onCellFormulaChange,
  isFormulaEditingActive,
  onCellClickForReference,
  onStartFormulaEdit,
  onEndFormulaEdit,
  onFormulaModeChange,
  formulaEditorRef,
}: AppRowComponentProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editLabelValue, setEditLabelValue] = useState(appRow.label)
  const labelInputRef = useRef<HTMLInputElement>(null)

  // Build formula context for row formula evaluation
  const formulaContext = useMemo(() => {
    if (appRow.rowType !== "formula" || !appRow.formula) return null
    
    // Build column definitions from all columns (for formula context)
    const schemaColumns = allColumns
      .filter(c => c.kind === "source")
      .map(c => ({ key: c.key, label: c.label, dataType: c.dataType }))
    
    return buildFormulaContext(
      "current",
      [{ id: "current", label: "Current", rows: allRows }],
      schemaColumns,
      identityKey
    )
  }, [appRow.rowType, appRow.formula, allRows, allColumns, identityKey])

  // Evaluate formula for a specific column
  const evaluateFormulaForColumn = useCallback((column: ColumnDefinition): string => {
    if (!formulaContext || !appRow.formula) return "—"
    
    try {
      const formula: FormulaDefinition = {
        expression: appRow.formula.expression as string,
        references: [],
        resultType: (appRow.formula.resultType as "number" | "currency" | "text") || "number",
      }
      
      const columnContext = {
        columnKey: column.key,
        columnLabel: column.label,
      }
      
      const result = evaluateRowFormula(formula, formulaContext, columnContext)
      
      if (result.ok) {
        const format = (appRow.formula as { format?: string } | null)?.format
        const resultType = appRow.formula.resultType as string
        const formulaColumn = formulaColumns?.get(column.id)
        const columnFormat = column.dataType === "currency"
          ? "currency"
          : column.dataType === "formula" && formulaColumn?.resultType === "currency"
            ? "currency"
            : "number"
        const formatType = format === "inheritColumn" ? columnFormat : resultType

        if (formatType === "currency") {
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(result.value)
        }
        return result.value.toLocaleString()
      }
      return "Error"
    } catch (err) {
      console.error("[AppRowComponent] Formula evaluation error:", err)
      return "Error"
    }
  }, [formulaContext, appRow.formula, formulaColumns])

  const handleDelete = useCallback(async () => {
    if (!onDeleteRow || isDeleting) return
    setIsDeleting(true)
    try {
      await onDeleteRow(appRow.id)
    } finally {
      setIsDeleting(false)
    }
  }, [onDeleteRow, appRow.id, isDeleting])

  const handleEditFormula = useCallback(() => {
    if (onEditFormulaRow && appRow.rowType === "formula") {
      onEditFormulaRow(appRow.id)
    }
  }, [onEditFormulaRow, appRow.id, appRow.rowType])

  // Handle starting label edit
  const handleStartLabelEdit = useCallback(() => {
    if (onRenameRow) {
      setEditLabelValue(appRow.label)
      setIsEditingLabel(true)
      setTimeout(() => labelInputRef.current?.select(), 0)
    }
  }, [onRenameRow, appRow.label])

  // Handle saving label
  const handleSaveLabel = useCallback(async () => {
    const trimmed = editLabelValue.trim()
    if (trimmed && trimmed !== appRow.label && onRenameRow) {
      await onRenameRow(appRow.id, trimmed)
    }
    setIsEditingLabel(false)
  }, [editLabelValue, appRow.label, appRow.id, onRenameRow])

  // Handle label input keydown
  const handleLabelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSaveLabel()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setEditLabelValue(appRow.label)
      setIsEditingLabel(false)
    }
  }, [handleSaveLabel, appRow.label])

  return (
    <div
      className={`
        flex
        border-b border-gray-200
        bg-gray-50
        hover:bg-gray-100
        group
      `}
      style={{ height: `${ROW_HEIGHT}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Row label in first column position with action buttons */}
      <div
        className="px-2 py-1.5 border-r border-gray-200 flex items-center gap-1.5 font-medium text-gray-700 text-xs relative"
        style={{
          width: visibleColumns[0]?.width ?? getDefaultColumnWidth(visibleColumns[0]?.dataType || "text"),
          minWidth: visibleColumns[0]?.width ?? getDefaultColumnWidth(visibleColumns[0]?.dataType || "text"),
          flexShrink: 0,
        }}
      >
        {/* Formula icon for formula rows */}
        {appRow.rowType === "formula" && (
          <FunctionSquare className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
        )}
        
        {/* Editable label */}
        {isEditingLabel ? (
          <input
            ref={labelInputRef}
            type="text"
            value={editLabelValue}
            onChange={(e) => setEditLabelValue(e.target.value)}
            onBlur={handleSaveLabel}
            onKeyDown={handleLabelKeyDown}
            className="flex-1 min-w-0 px-1 py-0.5 text-xs border border-blue-500 rounded outline-none bg-white"
            autoFocus
          />
        ) : (
          <span 
            className={`truncate ${onRenameRow ? "cursor-pointer hover:text-blue-600" : ""}`}
            onDoubleClick={handleStartLabelEdit}
            title={onRenameRow ? "Double-click to rename" : undefined}
          >
            {appRow.label}
          </span>
        )}
        
        {/* Action buttons on hover */}
        {isHovered && !isEditingLabel && (
          <div className="absolute right-1 flex items-center gap-0.5">
            {/* Rename button */}
            {onRenameRow && (
              <button
                onClick={handleStartLabelEdit}
                className="p-0.5 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                title="Rename row"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Edit formula button for formula rows */}
            {appRow.rowType === "formula" && onEditFormulaRow && (
              <button
                onClick={handleEditFormula}
                className="p-0.5 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit formula"
              >
                <FunctionSquare className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Delete button */}
            {onDeleteRow && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete row"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Rest of the columns */}
      {visibleColumns.slice(1).map((column, colIndex) => {
        // Calculate cell reference (A1 style) - app rows start after data rows
        const rowNumber = totalDataRows + appRowIndex + 1
        const cellRef = `${columnToLetter(colIndex + 1)}${rowNumber}`
        const cellFormulaData = cellFormulas?.get(cellRef)
        
        // For formula rows, evaluate the formula
        if (appRow.rowType === "formula") {
          const formulaValue = evaluateFormulaForColumn(column)
          return (
            <AppRowCell
              key={column.id}
              column={column}
              value={formulaValue}
              appRow={appRow}
              onRowCellValueChange={onRowCellValueChange}
              cellRef={cellRef}
              cellFormula={cellFormulaData}
              onCellFormulaChange={onCellFormulaChange}
              allRows={allRows}
              allColumns={allColumns}
              isFormulaEditingActive={isFormulaEditingActive}
              onCellClickForReference={onCellClickForReference}
              onStartFormulaEdit={onStartFormulaEdit}
              onEndFormulaEdit={onEndFormulaEdit}
              onFormulaModeChange={onFormulaModeChange}
              formulaEditorRef={formulaEditorRef}
            />
          )
        }
        
        // For text rows, find the stored value
        const cellValue = appRow.values.find((v) => v.columnKey === column.key)
        const displayValue = cellValue?.value || ""
        
        return (
          <AppRowCell
            key={column.id}
            column={column}
            value={displayValue}
            appRow={appRow}
            onRowCellValueChange={onRowCellValueChange}
            cellRef={cellRef}
            cellFormula={cellFormulaData}
            onCellFormulaChange={onCellFormulaChange}
            allRows={allRows}
            allColumns={allColumns}
            isFormulaEditingActive={isFormulaEditingActive}
            onCellClickForReference={onCellClickForReference}
            onStartFormulaEdit={onStartFormulaEdit}
            onEndFormulaEdit={onEndFormulaEdit}
            onFormulaModeChange={onFormulaModeChange}
            formulaEditorRef={formulaEditorRef}
          />
        )
      })}
      
      {/* Empty cell for add column - matches header */}
      {showAddColumn && (
        <div
          className="border-r border-gray-200 bg-gray-50"
          style={{ width: 60, minWidth: 60, flexShrink: 0 }}
        />
      )}
    </div>
  )
}

// ============================================
// App Row Cell Component (with Excel-style formula support)
// ============================================

interface AppRowCellProps {
  column: ColumnDefinition
  value: string
  appRow: AppRowDefinition
  onRowCellValueChange?: (rowId: string, columnKey: string, value: string | null) => Promise<void>
  // Cell formula props
  cellRef: string
  cellFormula?: CellFormulaData
  onCellFormulaChange?: (cellRef: string, formula: string | null) => Promise<void>
  allRows: Record<string, unknown>[]
  allColumns: ColumnDefinition[]
  isFormulaEditingActive?: boolean
  onCellClickForReference?: (cellRef: string) => void
  onStartFormulaEdit?: (cellRef: string) => void
  onEndFormulaEdit?: () => void
  onFormulaModeChange?: (isFormulaMode: boolean) => void
  formulaEditorRef?: React.MutableRefObject<import("./cell-editors/formula-cell").FormulaCellEditorRef | null>
}

function AppRowCell({
  column,
  value,
  appRow,
  onRowCellValueChange,
  cellRef,
  cellFormula,
  onCellFormulaChange,
  allRows,
  allColumns,
  isFormulaEditingActive,
  onCellClickForReference,
  onStartFormulaEdit,
  onEndFormulaEdit,
  onFormulaModeChange,
  formulaEditorRef,
}: AppRowCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Evaluate cell formula if present
  const displayValue = useMemo((): CellValue => {
    if (cellFormula?.formula) {
      try {
        const parseResult = parseCellFormula(cellFormula.formula)
        if (!parseResult.ok) {
          console.error(`[AppRowCell] Parse error for ${cellRef}:`, parseResult.error)
          return { type: "error" as const, message: parseResult.error }
        }
        
        const context = buildCellEvalContext(
          "current",
          [{ id: "current", label: "Current", rows: allRows }],
          allColumns.map((c) => ({ key: c.key, label: c.label }))
        )
        
        const result = evaluateCellFormula(parseResult.ast, context)
        if (result.ok) {
          return { type: "number" as const, value: result.value }
        }
        console.error(`[AppRowCell] Eval error for ${cellRef}:`, result.error)
        return { type: "error" as const, message: result.error }
      } catch (err) {
        console.error(`[AppRowCell] Exception for ${cellRef}:`, err)
        return { type: "error" as const, message: err instanceof Error ? err.message : "Formula error" }
      }
    }
    // Return the stored value as text
    return { type: "text" as const, value: value || "" }
  }, [cellFormula, value, allRows, allColumns, cellRef])

  // Get raw display value
  const rawValue = useMemo(() => {
    if (displayValue.type === "number" || displayValue.type === "currency") {
      return displayValue.value
    }
    if (displayValue.type === "text") {
      return displayValue.value
    }
    if (displayValue.type === "error") {
      return `#ERR: ${displayValue.message}`
    }
    return ""
  }, [displayValue])

  const handleClick = useCallback((e: React.MouseEvent) => {
    // If formula editing is active in another cell, insert this cell's reference
    if (isFormulaEditingActive && !isEditing && onCellClickForReference) {
      e.preventDefault()
      e.stopPropagation()
      onCellClickForReference(cellRef)
      return
    }
  }, [isFormulaEditingActive, isEditing, onCellClickForReference, cellRef])

  const handleDoubleClick = useCallback(() => {
    // Allow editing for text app rows (not formula rows which use the old system)
    if (appRow.rowType === "text" && onCellFormulaChange) {
      setIsEditing(true)
      onStartFormulaEdit?.(cellRef)
    }
  }, [appRow.rowType, onCellFormulaChange, onStartFormulaEdit, cellRef])

  const handleSave = useCallback(async (savedValue: string, isFormulaValue: boolean) => {
    setIsEditing(false)
    onEndFormulaEdit?.()
    
    if (isFormulaValue && onCellFormulaChange) {
      // Save as cell formula
      await onCellFormulaChange(cellRef, savedValue)
    } else if (cellFormula && onCellFormulaChange) {
      // Had a formula, now clearing it
      await onCellFormulaChange(cellRef, null)
      // Also save as regular value
      if (onRowCellValueChange) {
        await onRowCellValueChange(appRow.id, column.key, savedValue || null)
      }
    } else if (onRowCellValueChange) {
      // Regular value change
      await onRowCellValueChange(appRow.id, column.key, savedValue || null)
    }
  }, [onCellFormulaChange, cellRef, cellFormula, onRowCellValueChange, appRow.id, column.key, onEndFormulaEdit])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    onEndFormulaEdit?.()
  }, [onEndFormulaEdit])

  const hasFormula = !!cellFormula?.formula
  const isClickableForReference = isFormulaEditingActive && !isEditing

  // Formula rows (old system) show calculated value (not editable via cell formulas)
  if (appRow.rowType === "formula") {
    return (
      <div
        className={`
          px-2 py-1.5
          border-r border-gray-200
          flex items-center justify-center
          text-xs text-gray-700
          ${isClickableForReference ? "cursor-cell hover:bg-green-100 hover:outline hover:outline-2 hover:outline-green-400" : ""}
        `}
        style={{
          width: column.width ?? getDefaultColumnWidth(column.dataType),
          minWidth: column.width ?? getDefaultColumnWidth(column.dataType),
          flexShrink: 0,
        }}
        onClick={handleClick}
      >
        {value || "—"}
      </div>
    )
  }

  // Text rows support Excel-style cell formulas
  return (
    <div
      className={`
        px-2 py-1.5
        border-r border-gray-200
        flex items-center justify-center
        text-xs text-gray-700
        cursor-pointer hover:bg-blue-50
        ${hasFormula ? "relative" : ""}
        ${isClickableForReference ? "cursor-cell hover:bg-green-100 hover:outline hover:outline-2 hover:outline-green-400" : ""}
      `}
      style={{
        width: column.width ?? getDefaultColumnWidth(column.dataType),
        minWidth: column.width ?? getDefaultColumnWidth(column.dataType),
        flexShrink: 0,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <FormulaCellEditor
          ref={formulaEditorRef}
          value={rawValue}
          formula={cellFormula?.formula}
          cellRef={cellRef}
          isFormulaCell={hasFormula}
          onSave={handleSave}
          onCancel={handleCancel}
          onFormulaModeChange={onFormulaModeChange}
        />
      ) : (
        <>
          <CellRenderer 
            value={displayValue} 
            column={column}
            isHovered={isHovered}
            isAppColumn={true}
            isFirstColumn={false}
          />
          {/* Formula indicator - blue triangle in corner */}
          {hasFormula && (
            <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-blue-500 border-l-[6px] border-l-transparent" />
          )}
        </>
      )}
    </div>
  )
}

// ============================================
// Data Grid Cell Component (with Excel-style formula support)
// ============================================

interface DataGridCellProps {
  column: ColumnDefinition
  cellValue: CellValue
  isAppColumn: boolean
  columnId: string
  rowIdentity: string
  onCellValueChange?: (columnId: string, rowIdentity: string, value: unknown) => Promise<void>
  isFirstColumn?: boolean
  // Cell formula props
  cellRef: string
  cellFormula?: CellFormulaData
  onCellFormulaChange?: (cellRef: string, formula: string | null) => Promise<void>
  allRows: Record<string, unknown>[]
  allColumns: ColumnDefinition[]
  currentRowIndex: number
  // Click-to-select props
  isFormulaEditingActive?: boolean
  onCellClickForReference?: (cellRef: string) => void
  onStartFormulaEdit?: (cellRef: string) => void
  onEndFormulaEdit?: () => void
  onFormulaModeChange?: (isFormulaMode: boolean) => void
  formulaEditorRef?: React.MutableRefObject<import("./cell-editors/formula-cell").FormulaCellEditorRef | null>
}

function DataGridCell({
  column,
  cellValue,
  isAppColumn,
  columnId,
  rowIdentity,
  onCellValueChange,
  isFirstColumn = false,
  cellRef,
  cellFormula,
  onCellFormulaChange,
  allRows,
  allColumns,
  currentRowIndex,
  isFormulaEditingActive,
  onCellClickForReference,
  onStartFormulaEdit,
  onEndFormulaEdit,
  onFormulaModeChange,
  formulaEditorRef,
}: DataGridCellProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Evaluate cell formula if present
  const displayValue = useMemo((): CellValue => {
    if (cellFormula?.formula) {
      try {
        // Parse the formula
        const parseResult = parseCellFormula(cellFormula.formula)
        if (!parseResult.ok) {
          return { type: "error" as const, message: parseResult.error }
        }
        
        // Build context for evaluation - use all columns for proper index mapping
        const context = buildCellEvalContext(
          "current",
          [{ id: "current", label: "Current", rows: allRows }],
          allColumns.map((c) => ({ key: c.key, label: c.label }))
        )
        
        // Evaluate the formula
        const result = evaluateCellFormula(parseResult.ast, context)
        
        if (result.ok) {
          // Use the detected format from the source cells
          if (typeof result.value === "number") {
            if (result.format === "currency") {
              return { type: "currency" as const, value: result.value }
            }
            return { type: "number" as const, value: result.value }
          }
          return { type: "text" as const, value: String(result.value) }
        }
        return { type: "error" as const, message: result.error }
      } catch (err) {
        return { type: "error" as const, message: err instanceof Error ? err.message : "Formula error" }
      }
    }
    return cellValue
  }, [cellFormula, cellValue, allRows, allColumns])

  const handleClick = useCallback((e: React.MouseEvent) => {
    // If formula editing is active in another cell, insert this cell's reference
    if (isFormulaEditingActive && !isEditing && onCellClickForReference) {
      e.preventDefault()
      e.stopPropagation()
      onCellClickForReference(cellRef)
      return
    }
  }, [isFormulaEditingActive, isEditing, onCellClickForReference, cellRef])

  const handleDoubleClick = useCallback(() => {
    // Only allow editing for app-owned columns (source data is read-only)
    if (onCellFormulaChange && isAppColumn) {
      setIsEditing(true)
      onStartFormulaEdit?.(cellRef)
    }
  }, [onCellFormulaChange, isAppColumn, onStartFormulaEdit, cellRef])

  const handleSave = useCallback(async (value: string, isFormulaValue: boolean) => {
    setIsEditing(false)
    onEndFormulaEdit?.()
    if (onCellFormulaChange) {
      if (isFormulaValue) {
        await onCellFormulaChange(cellRef, value)
      } else if (cellFormula) {
        // Had a formula, now clearing it
        await onCellFormulaChange(cellRef, null)
      }
    }
  }, [onCellFormulaChange, cellRef, cellFormula, onEndFormulaEdit])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    onEndFormulaEdit?.()
  }, [onEndFormulaEdit])

  // Get raw display value as string/number
  const rawValue = useMemo(() => {
    if (displayValue.type === "number" || displayValue.type === "currency") {
      return displayValue.value
    }
    if (displayValue.type === "text") {
      return displayValue.value
    }
    if (displayValue.type === "error") {
      return `#ERR: ${displayValue.message}`
    }
    return ""
  }, [displayValue])

  // First column: left-aligned, bold
  // Other columns: centered
  const alignmentClass = isFirstColumn ? "justify-start" : "justify-center"
  const fontClass = isFirstColumn ? "font-semibold" : ""
  const hasFormula = !!cellFormula?.formula
  // Highlight cells when in formula mode (showing they're clickable for reference insertion)
  const isClickableForReference = isFormulaEditingActive && !isEditing

  return (
    <div
      className={`
        px-2 py-1.5
        border-r border-gray-200
        flex items-center
        text-xs text-gray-700
        ${alignmentClass}
        ${fontClass}
        ${isAppColumn ? "cursor-pointer hover:bg-blue-50" : ""}
        ${hasFormula ? "relative" : ""}
        ${isClickableForReference ? "cursor-cell hover:bg-green-100 hover:outline hover:outline-2 hover:outline-green-400" : ""}
      `}
      style={{
        width: column.width ?? getDefaultColumnWidth(column.dataType),
        minWidth: column.width ?? getDefaultColumnWidth(column.dataType),
        flexShrink: 0,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <FormulaCellEditor
          ref={formulaEditorRef}
          value={rawValue}
          formula={cellFormula?.formula}
          cellRef={cellRef}
          isFormulaCell={hasFormula}
          onSave={handleSave}
          onCancel={handleCancel}
          onFormulaModeChange={onFormulaModeChange}
        />
      ) : (
        <>
          <CellRenderer 
            value={displayValue} 
            column={column}
            isHovered={isHovered}
            isAppColumn={isAppColumn}
            isFirstColumn={isFirstColumn}
          />
          {/* Formula indicator - blue triangle in corner */}
          {hasFormula && (
            <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-blue-500 border-l-[6px] border-l-transparent" />
          )}
        </>
      )}
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
