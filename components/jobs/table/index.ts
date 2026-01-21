// Table Components - Export all table-related components
export { TableGrid } from "./table-grid"
export { TableHeader, CompareHeader } from "./table-header"
export { TableRow, VarianceDetailRow } from "./table-row"
export type { TableRowData, RowDeltaType } from "./table-row"
export { TableCell } from "./table-cell"
export { TableToolbar } from "./table-toolbar"
export { RowSidePanel } from "./row-side-panel"

// Schema Components
export { TableSchemaEditor } from "./schema-editor"
export type { TableSchema, TableColumn, ColumnEditPolicy, ColumnSource } from "./schema-editor"
export { ColumnTypeSelector, getColumnTypeIcon, getColumnTypeLabel } from "./column-type-selector"
export type { ColumnType } from "./column-type-selector"
export { IdentityKeySelector } from "./identity-key-selector"

// Import Components
export { ImportModal } from "./import-modal"
export { ImportSummaryModal } from "./import-summary-modal"

// Compare/Variance Components
export { CompareView } from "./compare-view"
export { VarianceFilter, applyVarianceFilters } from "./variance-filter"
export type { VarianceFilterState } from "./variance-filter"

// Tab Components (for easy integration)
export { DataTab } from "./data-tab"
