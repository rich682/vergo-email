/**
 * Data Grid Type Definitions
 *
 * Core abstractions for a forward-compatible virtualized data grid:
 * - ColumnDefinition: Unified column model (source, app, computed)
 * - CellValue: Normalized cell values supporting future complex types
 * - SheetContext: Generic sheet model (snapshot, period, computed view)
 * - CellResolver: Interface for resolving cell values (future formulas)
 */

// ============================================
// Column Types
// ============================================

/**
 * Column kinds:
 * - "source": Uploaded from snapshot schema
 * - "app": App-owned/freeform (notes, labels, owners)
 * - "computed": Formula-based (future)
 */
export type ColumnKind = "source" | "app" | "computed"

/**
 * Data types for columns.
 * Reserved types are defined now for forward compatibility but not implemented in V1.
 */
export type DataType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "currency"
  // Reserved for V2+:
  | "attachment"
  | "label"
  | "user"
  | "link"

/**
 * Unified column definition.
 * Supports source columns (from schema), app columns (freeform), and computed columns (formulas).
 */
export interface ColumnDefinition {
  /** Stable internal ID (e.g., "col_abc123") */
  id: string
  /** Schema key for lookups (e.g., "email", "amount") */
  key: string
  /** Display name */
  label: string
  /** Column kind */
  kind: ColumnKind
  /** Data type for filtering/formatting */
  dataType: DataType
  /** Whether this column can be filtered */
  isFilterable: boolean
  /** Whether this column can be sorted */
  isSortable: boolean
  /** Current visibility state */
  isVisible: boolean
  /** Optional fixed width in pixels */
  width?: number

  // Reserved for V2 (do not implement behavior now):
  // formula?: { expression: string; references: string[] }
  // appMeta?: { writable: boolean }
}

// ============================================
// Cell Value Types (Attachments-Ready)
// ============================================

/**
 * Cell value type discriminator.
 * Includes reserved types for future complex cell values.
 */
export type CellValueType =
  | "empty"
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "currency"
  // Reserved for V2+:
  | "attachment"
  | "label"
  | "user"
  | "link"
  | "error"

/**
 * Attachment reference for future file attachments in cells.
 */
export interface AttachmentRef {
  id: string
  filename: string
  mimeType?: string
  sizeBytes?: number
  url?: string
}

/**
 * User reference for future user cells.
 */
export interface UserRef {
  userId: string
  display: string
}

/**
 * Link reference for future link cells.
 */
export interface LinkRef {
  label?: string
  url: string
}

/**
 * Normalized cell value abstraction.
 * All cell values in the grid go through this type, enabling future complex types
 * without rewriting the grid.
 */
export type CellValue =
  | { type: "empty" }
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  | { type: "currency"; value: number }
  | { type: "date"; value: string } // ISO 8601
  | { type: "boolean"; value: boolean }
  // Reserved for V2+:
  | { type: "attachment"; value: AttachmentRef[] }
  | { type: "label"; value: string[] }
  | { type: "user"; value: UserRef }
  | { type: "link"; value: LinkRef }
  | { type: "error"; message: string }

// ============================================
// Sheet Context (Future Tabs/Periods)
// ============================================

/**
 * Sheet context for identifying which "sheet" of data to display.
 * V1 only uses "snapshot" kind, but this enables future period tabs and computed views.
 */
export type SheetContext =
  | { kind: "snapshot"; snapshotId: string }
  // Reserved for V2+:
  | { kind: "period"; periodStart: string; periodEnd: string }
  | { kind: "computed_view"; id: string }

// ============================================
// Cell Resolver Interface
// ============================================

/**
 * Arguments for resolving a cell value.
 */
export interface CellResolverArgs {
  row: Record<string, unknown>
  column: ColumnDefinition
  sheet: SheetContext
}

/**
 * Cell resolver interface.
 * V1 implementation reads primitives from row data.
 * Future implementations can evaluate formulas, fetch cross-sheet references, etc.
 */
export interface CellResolver {
  /** Get unique identifier for a row */
  getRowId: (row: Record<string, unknown>) => string
  /** Resolve a cell value for display/filtering */
  getCellValue: (args: CellResolverArgs) => CellValue
}

// ============================================
// Filter & Sort State
// ============================================

/**
 * Filter operators for different data types.
 */
export type FilterOperator =
  // Text
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  // Number/Currency
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  // Date
  | "before"
  | "after"
  | "on"
  // Boolean
  | "is_true"
  | "is_false"
  // Multi-select (value-based filtering like Excel)
  | "in_values"

/**
 * Filter state for a single column.
 */
export interface ColumnFilter {
  columnId: string
  operator: FilterOperator
  /** Single value for most operators */
  value?: string | number | boolean
  /** Multiple values for "in_values" operator (Excel-style checkbox filter) */
  selectedValues?: string[]
}

/**
 * Sort direction.
 */
export type SortDirection = "asc" | "desc"

/**
 * Sort state for a single column.
 */
export interface ColumnSort {
  columnId: string
  direction: SortDirection
}

/**
 * Complete filter/sort state for the grid.
 */
export interface GridFilterState {
  /** Global search query (searches all text columns) */
  globalSearch: string
  /** Per-column filters */
  columnFilters: ColumnFilter[]
  /** Sort state (single column for now) */
  sort: ColumnSort | null
}

// ============================================
// Grid Props
// ============================================

/**
 * Snapshot metadata for the sheet selector.
 */
export interface SheetMetadata {
  id: string
  periodLabel: string | null
  createdAt: string
  rowCount: number
  isLatest: boolean
}

/**
 * Props for the DataGrid component.
 */
export interface DataGridProps {
  /** Column definitions */
  columns: ColumnDefinition[]
  /** Row data */
  rows: Record<string, unknown>[]
  /** Cell resolver for converting row data to CellValues */
  resolver: CellResolver
  /** Current sheet context */
  sheet: SheetContext
  /** Initial filter state */
  initialFilterState?: Partial<GridFilterState>
  /** Callback when filter state changes */
  onFilterChange?: (state: GridFilterState) => void
  /** Callback when column visibility changes */
  onColumnVisibilityChange?: (columnId: string, isVisible: boolean) => void
  /** Loading state */
  isLoading?: boolean
  /** Error message */
  error?: string | null
}

/**
 * Props for the DataGridToolbar component.
 */
export interface DataGridToolbarProps {
  /** Current filter state */
  filterState: GridFilterState
  /** Callback when filter state changes */
  onFilterChange: (state: GridFilterState) => void
  /** Column definitions (for visibility toggle) */
  columns: ColumnDefinition[]
  /** Callback when column visibility changes */
  onColumnVisibilityChange: (columnId: string, isVisible: boolean) => void
  /** Available sheets for selector */
  sheets: SheetMetadata[]
  /** Currently selected sheet */
  currentSheet: SheetContext
  /** Callback when sheet changes */
  onSheetChange: (sheet: SheetContext) => void
}

/**
 * Unique values for a column (for value-based filtering).
 */
export interface ColumnUniqueValues {
  columnId: string
  values: string[]
}

/**
 * Props for the DataGridHeader component.
 */
export interface DataGridHeaderProps {
  /** Visible column definitions */
  columns: ColumnDefinition[]
  /** Current sort state */
  sort: ColumnSort | null
  /** Callback when sort changes */
  onSortChange: (sort: ColumnSort | null) => void
  /** Per-column filters */
  columnFilters: ColumnFilter[]
  /** Callback when column filter changes */
  onColumnFilterChange: (filter: ColumnFilter | null, columnId: string) => void
  /** Total width for horizontal scroll sync */
  totalWidth: number
  /** Unique values per column for value-based filtering */
  columnUniqueValues?: ColumnUniqueValues[]
}
