/**
 * Shared types for the Data Tab feature
 * 
 * These types are used across multiple hooks and components
 * in the data tab architecture.
 */

import type { StatusOption, TeamMember } from "@/components/data-grid"
import type { SheetContext, SheetMetadata, GridFilterState, ColumnDefinition, CellResolver } from "@/lib/data-grid/types"
import type { RefObject } from "react"

// Re-export types that are used externally
export type { SheetContext, SheetMetadata, GridFilterState, ColumnDefinition, CellResolver }

// ============================================
// Schema & Dataset Types
// ============================================

export interface SchemaColumn {
  key: string
  label: string
  type: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
}

export interface StakeholderMapping {
  columnKey: string
  matchedField: string
  visibility?: "own_rows" | "all_rows"
}

export interface SnapshotInfo {
  id: string
  rowCount: number
  createdAt: string
  periodLabel?: string | null
}

export interface SnapshotMetadataAPI {
  id: string
  periodLabel: string | null
  periodStart: string | null
  rowCount: number
  createdAt: string
  isLatest: boolean
}

export interface DatasetTemplate {
  id: string
  name: string
  schema: SchemaColumn[]
  identityKey: string
  stakeholderMapping: StakeholderMapping | null
  snapshotCount: number
  latestSnapshot?: SnapshotInfo | null
  snapshots?: SnapshotMetadataAPI[]
}

export interface DataStatus {
  enabled: boolean
  schemaConfigured: boolean
  datasetTemplate: DatasetTemplate | null
}

// ============================================
// App Column Types
// ============================================

export interface AppColumnDef {
  id: string
  key: string
  label: string
  dataType: "text" | "status" | "attachment" | "user" | "formula"
  config?: {
    options?: StatusOption[]
    // Formula config
    expression?: string
    resultType?: "number" | "currency" | "text"
    references?: string[]
  } | null
  position: number
}

export interface AppColumnValueData {
  [rowIdentity: string]: {
    value: unknown
    updatedAt: string
  }
}

// ============================================
// App Row Types
// ============================================

export interface AppRowDef {
  id: string
  rowType: "text" | "formula"
  label: string
  position: number
  formula?: Record<string, unknown> | null
  values: AppRowValueDef[]
}

export interface AppRowValueDef {
  id: string
  rowId: string
  columnKey: string
  value: string | null
}

// ============================================
// Component Props
// ============================================

export interface DataTabUniversalProps {
  taskInstanceId: string
  taskName: string
  lineageId: string | null
  isSnapshot?: boolean
  isAdHoc?: boolean
  onConvertToRecurring?: () => void
  // Board period info for period-aware uploads
  boardPeriodStart?: string | null
  boardPeriodEnd?: string | null
  boardName?: string | null
}

// ============================================
// Context Types
// ============================================

export interface DataTabContextValue {
  // Core identifiers
  taskInstanceId: string
  lineageId: string | null
  
  // Period context (ref to avoid circular deps)
  periodLabelRef: RefObject<string | null>
  
  // Team members (shared across columns)
  teamMembers: TeamMember[]
}

// ============================================
// Hook Return Types
// ============================================

export interface UseDataStatusReturn {
  dataStatus: DataStatus | null
  loading: boolean
  error: string | null
  fetchDataStatus: () => Promise<void>
}

export interface UsePeriodContextReturn {
  currentPeriodLabel: string | null
  periodLabelRef: RefObject<string | null>
  currentPeriodSnapshot: SnapshotMetadataAPI | null
  sheets: SheetMetadata[]
  isViewingCurrentPeriod: boolean
  selectedSheetPeriodLabel: string | null
}

export interface UseAppColumnsReturn {
  appColumns: AppColumnDef[]
  appColumnValues: Map<string, AppColumnValueData>
  loadingAppColumns: boolean
  fetchAppColumns: () => Promise<void>
  fetchAppColumnValues: (rowIdentities: string[]) => Promise<void>
  handleAddColumn: (type: string, label: string) => Promise<void>
  handleRenameColumn: (columnId: string, newLabel: string) => Promise<void>
  handleDeleteAppColumn: (columnId: string) => Promise<void>
  handleCellValueUpdate: (columnId: string, rowIdentity: string, value: unknown) => Promise<void>
}

export interface UseAppRowsReturn {
  appRows: AppRowDef[]
  loadingAppRows: boolean
  fetchAppRows: () => Promise<void>
  handleAddRow: (type: string, label: string) => Promise<void>
  handleRenameRow: (rowId: string, newLabel: string) => Promise<void>
  handleDeleteAppRow: (rowId: string) => Promise<void>
  handleRowCellValueUpdate: (rowId: string, columnKey: string, value: string | null) => Promise<void>
}

export interface UseSheetDataReturn {
  snapshotRows: Record<string, unknown>[]
  loadingSnapshot: boolean
  snapshotError: string | null
  fetchSnapshotRows: (snapshotId: string) => Promise<void>
  cellResolver: CellResolver | null
}

export interface UseCellFormulasReturn {
  cellFormulas: Map<string, { expression: string; resultType: string }>
  loadingCellFormulas: boolean
  fetchCellFormulas: () => Promise<void>
  handleCellFormulaChange: (cellRef: string, formula: string | null) => Promise<void>
}
