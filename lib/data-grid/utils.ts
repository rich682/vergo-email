/**
 * Data Grid Utilities
 *
 * Helper functions for:
 * - Converting schema to ColumnDefinitions
 * - Converting primitives to CellValues
 * - Creating CellResolver instances
 * - Filtering and sorting rows
 * - Debouncing
 */

import type {
  ColumnDefinition,
  CellValue,
  CellResolver,
  DataType,
  GridFilterState,
  ColumnFilter,
  ColumnSort,
  SheetContext,
} from "./types"

// ============================================
// Schema to Columns Mapping
// ============================================

/**
 * Schema column from DatasetTemplate
 */
interface SchemaColumn {
  key: string
  label: string
  type: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
}

/**
 * Convert a DatasetTemplate schema to ColumnDefinitions.
 */
export function schemaToColumns(schema: SchemaColumn[]): ColumnDefinition[] {
  return schema.map((col, index) => ({
    id: `col_${index}_${col.key}`,
    key: col.key,
    label: col.label,
    kind: "source" as const,
    dataType: col.type as DataType,
    isFilterable: true,
    isSortable: true,
    isVisible: true,
    width: undefined,
  }))
}

// ============================================
// Primitive to CellValue Conversion
// ============================================

/**
 * Convert a primitive value to a CellValue based on the expected data type.
 */
export function primitiveToCell(value: unknown, dataType: DataType): CellValue {
  // Handle empty values
  if (value === null || value === undefined || value === "") {
    return { type: "empty" }
  }

  switch (dataType) {
    case "text":
      return { type: "text", value: String(value) }

    case "number": {
      const num = typeof value === "number" ? value : Number(value)
      if (isNaN(num)) {
        return { type: "error", message: "Invalid number" }
      }
      return { type: "number", value: num }
    }

    case "currency": {
      // Strip currency symbols and commas before parsing
      const cleaned = String(value).replace(/[$€£¥,]/g, "").trim()
      const amt = Number(cleaned)
      if (isNaN(amt)) {
        return { type: "error", message: "Invalid currency" }
      }
      return { type: "currency", value: amt }
    }

    case "date":
      // Keep as ISO string for display formatting
      return { type: "date", value: String(value) }

    case "boolean": {
      if (typeof value === "boolean") {
        return { type: "boolean", value }
      }
      const boolStr = String(value).toLowerCase().trim()
      const truthy = ["true", "yes", "1", "y", "on"].includes(boolStr)
      const falsy = ["false", "no", "0", "n", "off"].includes(boolStr)
      if (!truthy && !falsy) {
        return { type: "error", message: "Invalid boolean" }
      }
      return { type: "boolean", value: truthy }
    }

    // Reserved types - return error placeholder
    case "attachment":
    case "label":
    case "user":
    case "link":
      return { type: "error", message: `Unsupported type: ${dataType}` }

    default:
      // Fallback to text
      return { type: "text", value: String(value) }
  }
}

// ============================================
// Cell Resolver Factory
// ============================================

/**
 * Create a V1 CellResolver that reads primitives from row data.
 */
export function createV1CellResolver(identityKey: string): CellResolver {
  return {
    getRowId: (row) => {
      const id = row[identityKey]
      return id !== null && id !== undefined ? String(id) : ""
    },
    getCellValue: ({ row, column }) => {
      const rawValue = row[column.key]
      return primitiveToCell(rawValue, column.dataType)
    },
  }
}

// ============================================
// CellValue Helpers
// ============================================

/**
 * Extract a comparable value from a CellValue for sorting/filtering.
 * Returns null for empty or error values.
 */
export function getCellComparableValue(cell: CellValue): string | number | boolean | null {
  switch (cell.type) {
    case "empty":
    case "error":
      return null
    case "text":
      return cell.value.toLowerCase()
    case "number":
    case "currency":
      return cell.value
    case "date":
      return cell.value // ISO string is sortable
    case "boolean":
      return cell.value
    // Reserved types - return null (skip in filtering)
    case "attachment":
    case "label":
    case "user":
    case "link":
      return null
    default:
      return null
  }
}

/**
 * Get display text for a CellValue.
 */
export function getCellDisplayText(cell: CellValue): string {
  switch (cell.type) {
    case "empty":
      return ""
    case "error":
      return cell.message
    case "text":
      return cell.value
    case "number":
      return cell.value.toLocaleString()
    case "currency":
      return `$${cell.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case "date":
      return cell.value
    case "boolean":
      return cell.value ? "Yes" : "No"
    case "attachment":
      return `${cell.value.length} file(s)`
    case "label":
      return cell.value.join(", ")
    case "user":
      return cell.value.display
    case "link":
      return cell.value.label || cell.value.url
    default:
      return ""
  }
}

// ============================================
// Filtering Logic
// ============================================

/**
 * Check if a cell matches a filter.
 * Returns true for reserved types (attachment, label, user, link) - they pass through.
 */
export function matchesFilter(cell: CellValue, filter: ColumnFilter): boolean {
  // Reserved types always pass (don't crash on unknown types)
  if (["attachment", "label", "user", "link"].includes(cell.type)) {
    return true
  }

  // Handle is_empty / is_not_empty operators
  if (filter.operator === "is_empty") {
    return cell.type === "empty"
  }
  if (filter.operator === "is_not_empty") {
    return cell.type !== "empty"
  }

  // Handle in_values (multi-select checkbox filter like Excel)
  if (filter.operator === "in_values") {
    const selectedValues = filter.selectedValues || []
    if (selectedValues.length === 0) {
      return true // No filter applied
    }
    
    // Get the display text for the cell
    const cellText = getCellDisplayText(cell)
    
    // Check if "(Blanks)" is selected and cell is empty
    if (cell.type === "empty" && selectedValues.includes("__BLANK__")) {
      return true
    }
    
    // Check if cell value is in selected values
    return selectedValues.includes(cellText)
  }

  // Empty cells don't match other filters
  if (cell.type === "empty" || cell.type === "error") {
    return false
  }

  const filterValue = filter.value

  switch (cell.type) {
    case "text": {
      const textValue = cell.value.toLowerCase()
      const filterText = String(filterValue ?? "").toLowerCase()

      switch (filter.operator) {
        case "contains":
          return textValue.includes(filterText)
        case "not_contains":
          return !textValue.includes(filterText)
        case "equals":
          return textValue === filterText
        case "not_equals":
          return textValue !== filterText
        case "starts_with":
          return textValue.startsWith(filterText)
        case "ends_with":
          return textValue.endsWith(filterText)
        default:
          return true
      }
    }

    case "number":
    case "currency": {
      const numValue = cell.value
      const filterNum = Number(filterValue)
      if (isNaN(filterNum)) return true

      switch (filter.operator) {
        case "equals":
          return numValue === filterNum
        case "not_equals":
          return numValue !== filterNum
        case "gt":
          return numValue > filterNum
        case "gte":
          return numValue >= filterNum
        case "lt":
          return numValue < filterNum
        case "lte":
          return numValue <= filterNum
        default:
          return true
      }
    }

    case "date": {
      const dateValue = new Date(cell.value).getTime()
      const filterDate = new Date(String(filterValue)).getTime()
      if (isNaN(dateValue) || isNaN(filterDate)) return true

      switch (filter.operator) {
        case "on":
        case "equals":
          // Compare dates only (ignore time)
          return new Date(cell.value).toDateString() === new Date(String(filterValue)).toDateString()
        case "before":
          return dateValue < filterDate
        case "after":
          return dateValue > filterDate
        default:
          return true
      }
    }

    case "boolean": {
      const boolValue = cell.value
      switch (filter.operator) {
        case "is_true":
          return boolValue === true
        case "is_false":
          return boolValue === false
        default:
          return true
      }
    }

    default:
      return true
  }
}

/**
 * Check if a row matches the global search query.
 * Searches all visible text columns.
 */
export function matchesGlobalSearch(
  row: Record<string, unknown>,
  columns: ColumnDefinition[],
  resolver: CellResolver,
  sheet: SheetContext,
  query: string
): boolean {
  if (!query.trim()) return true

  const lowerQuery = query.toLowerCase()

  return columns.some((col) => {
    if (!col.isVisible) return false
    const cell = resolver.getCellValue({ row, column: col, sheet })
    const displayText = getCellDisplayText(cell).toLowerCase()
    return displayText.includes(lowerQuery)
  })
}

/**
 * Apply all filters to rows and return filtered results.
 */
export function filterRows(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[],
  resolver: CellResolver,
  sheet: SheetContext,
  filterState: GridFilterState
): Record<string, unknown>[] {
  return rows.filter((row) => {
    // Check global search
    if (!matchesGlobalSearch(row, columns, resolver, sheet, filterState.globalSearch)) {
      return false
    }

    // Check column filters
    for (const filter of filterState.columnFilters) {
      const column = columns.find((c) => c.id === filter.columnId)
      if (!column) continue

      const cell = resolver.getCellValue({ row, column, sheet })
      if (!matchesFilter(cell, filter)) {
        return false
      }
    }

    return true
  })
}

// ============================================
// Sorting Logic
// ============================================

/**
 * Compare two CellValues for sorting.
 */
export function compareCells(a: CellValue, b: CellValue, direction: "asc" | "desc"): number {
  const aVal = getCellComparableValue(a)
  const bVal = getCellComparableValue(b)

  // Nulls sort to the end
  if (aVal === null && bVal === null) return 0
  if (aVal === null) return 1
  if (bVal === null) return -1

  let result: number
  if (typeof aVal === "string" && typeof bVal === "string") {
    result = aVal.localeCompare(bVal)
  } else if (typeof aVal === "number" && typeof bVal === "number") {
    result = aVal - bVal
  } else if (typeof aVal === "boolean" && typeof bVal === "boolean") {
    result = aVal === bVal ? 0 : aVal ? -1 : 1
  } else {
    result = 0
  }

  return direction === "desc" ? -result : result
}

/**
 * Sort rows by a column.
 */
export function sortRows(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[],
  resolver: CellResolver,
  sheet: SheetContext,
  sort: ColumnSort | null
): Record<string, unknown>[] {
  if (!sort) return rows

  const column = columns.find((c) => c.id === sort.columnId)
  if (!column) return rows

  return [...rows].sort((a, b) => {
    const cellA = resolver.getCellValue({ row: a, column, sheet })
    const cellB = resolver.getCellValue({ row: b, column, sheet })
    return compareCells(cellA, cellB, sort.direction)
  })
}

/**
 * Apply filters and sorting to rows.
 */
export function processRows(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[],
  resolver: CellResolver,
  sheet: SheetContext,
  filterState: GridFilterState
): Record<string, unknown>[] {
  const filtered = filterRows(rows, columns, resolver, sheet, filterState)
  return sortRows(filtered, columns, resolver, sheet, filterState.sort)
}

// ============================================
// Debounce Utility
// ============================================

/**
 * Create a debounced function.
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      fn(...args)
      timeoutId = null
    }, delay)
  }
}

// ============================================
// Default Filter State
// ============================================

/**
 * Create an empty filter state.
 */
export function createEmptyFilterState(): GridFilterState {
  return {
    globalSearch: "",
    columnFilters: [],
    sort: null,
  }
}

// ============================================
// Column Width Calculation
// ============================================

/**
 * Calculate total width for all visible columns.
 * Uses fixed width if specified, otherwise uses a default based on data type.
 */
export function calculateTotalWidth(columns: ColumnDefinition[]): number {
  const visibleColumns = columns.filter((c) => c.isVisible)
  return visibleColumns.reduce((total, col) => {
    const width = col.width ?? getDefaultColumnWidth(col.dataType)
    return total + width
  }, 0)
}

/**
 * Get default column width based on data type.
 */
export function getDefaultColumnWidth(dataType: DataType): number {
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

/**
 * Get minimum column width based on data type.
 */
export function getMinColumnWidth(dataType: DataType): number {
  switch (dataType) {
    case "boolean":
      return 60
    case "number":
    case "currency":
      return 80
    case "date":
      return 100
    case "text":
    default:
      return 100
  }
}

// ============================================
// Unique Value Extraction (for value-based filtering)
// ============================================

/**
 * Extract unique values from a column for value-based filtering.
 * Returns sorted unique values as strings, plus a count of blank values.
 */
export function extractColumnUniqueValues(
  rows: Record<string, unknown>[],
  column: ColumnDefinition,
  resolver: CellResolver,
  sheet: SheetContext
): { values: string[]; blankCount: number } {
  const valueSet = new Set<string>()
  let blankCount = 0

  for (const row of rows) {
    const cell = resolver.getCellValue({ row, column, sheet })
    
    if (cell.type === "empty") {
      blankCount++
    } else {
      const displayText = getCellDisplayText(cell)
      if (displayText) {
        valueSet.add(displayText)
      } else {
        blankCount++
      }
    }
  }

  // Sort values alphabetically (case-insensitive)
  const values = Array.from(valueSet).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  )

  return { values, blankCount }
}

/**
 * Extract unique values for all columns.
 */
export function extractAllColumnUniqueValues(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[],
  resolver: CellResolver,
  sheet: SheetContext
): Map<string, { values: string[]; blankCount: number }> {
  const result = new Map<string, { values: string[]; blankCount: number }>()

  for (const column of columns) {
    if (column.isFilterable) {
      result.set(column.id, extractColumnUniqueValues(rows, column, resolver, sheet))
    }
  }

  return result
}
