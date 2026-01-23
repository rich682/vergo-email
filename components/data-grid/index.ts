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
export { AddColumnButton } from "./add-column-button"
export type { AppColumnType } from "./add-column-button"
export { AddRowButton } from "./add-row-button"
export type { AppRowType } from "./add-row-button"
export { SheetTabBar } from "./sheet-tab-bar"
export type { SheetTabBarProps } from "./sheet-tab-bar"
export { FormulaEditorModal } from "./formula-editor-modal"
export type { FormulaEditorModalProps, ColumnResource, SheetResource } from "./formula-editor-modal"

// Cell editors
export {
  NotesCell,
  StatusCell,
  StatusBadge,
  OwnerCell,
  OwnerBadge,
  UserAvatar,
  AttachmentsCell,
} from "./cell-editors"
export type {
  StatusOption,
  TeamMember,
  AttachmentRef as CellAttachmentRef,
} from "./cell-editors"

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
  ColumnUniqueValues,
  AttachmentRef,
  UserRef,
  LinkRef,
  DataType,
  ColumnKind,
  FilterOperator,
  SortDirection,
  AppRowDefinition,
  AppRowValue,
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
  extractColumnUniqueValues,
  extractAllColumnUniqueValues,
} from "@/lib/data-grid/utils"
