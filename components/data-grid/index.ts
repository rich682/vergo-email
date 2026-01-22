/**
 * Data Grid Components
 *
 * Barrel export for all data grid components.
 */

// Main grid component
export { DataGrid, ControlledDataGrid } from "./data-grid"
export type { ControlledDataGridProps } from "./data-grid"

// Sub-components
export { DataGridHeader } from "./data-grid-header"
export { DataGridToolbar } from "./data-grid-toolbar"
export { FilterPopover } from "./filter-popover"
export { CellRenderer, getAlignmentClass, getFontClass } from "./cell-renderers"

// Re-export types from lib
export type {
  ColumnDefinition,
  CellValue,
  CellValueType,
  SheetContext,
  CellResolver,
  GridFilterState,
  ColumnFilter,
  ColumnSort,
  SheetMetadata,
  DataGridProps,
  DataGridToolbarProps,
  DataGridHeaderProps,
  AttachmentRef,
  UserRef,
  LinkRef,
  DataType,
  ColumnKind,
  FilterOperator,
  SortDirection,
} from "@/lib/data-grid/types"

// Re-export utils
export {
  schemaToColumns,
  primitiveToCell,
  createV1CellResolver,
  processRows,
  filterRows,
  sortRows,
  createEmptyFilterState,
  debounce,
  getCellDisplayText,
  getCellComparableValue,
  calculateTotalWidth,
  getDefaultColumnWidth,
  getMinColumnWidth,
} from "@/lib/data-grid/utils"
