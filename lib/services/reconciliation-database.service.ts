/**
 * ReconciliationDatabaseService
 *
 * Handles loading database rows into reconciliation runs for database-backed
 * reconciliations. Supports period-based filtering using the same utilities
 * as the report system.
 */

import { prisma } from "@/lib/prisma"
import { periodKeyFromValue, type ReportCadence } from "@/lib/utils/period"
import { ReconciliationService, type SourceConfig } from "./reconciliation.service"

// ── Type Mapping ──────────────────────────────────────────────────────

/**
 * Map a database schema column dataType to a reconciliation SourceColumnDef type.
 */
export function mapDatabaseColumnType(
  dataType: string
): "date" | "amount" | "text" | "reference" {
  switch (dataType) {
    case "currency":
    case "number":
      return "amount"
    case "date":
      return "date"
    default:
      return "text"
  }
}

// ── Row Loading ───────────────────────────────────────────────────────

interface LoadRowsParams {
  databaseId: string
  organizationId: string
  /** Column keys to include (from the reconciliation config) */
  columnKeys?: string[]
  /** Date column for period filtering */
  dateColumnKey?: string
  /** Cadence for interpreting date values */
  cadence?: string
  /** Target period key (e.g. "2026-01") — rows outside this period are excluded */
  periodKey?: string
}

/**
 * Load rows from a database, optionally filtered by period.
 * Returns rows mapped to only the relevant column keys.
 */
export async function loadDatabaseRows(params: LoadRowsParams): Promise<{
  rows: Record<string, unknown>[]
  totalRows: number
}> {
  const db = await prisma.database.findFirst({
    where: { id: params.databaseId, organizationId: params.organizationId },
    select: { rows: true, rowCount: true },
  })

  if (!db) {
    throw new Error(`Database not found: ${params.databaseId}`)
  }

  let rows = (db.rows as Record<string, unknown>[]) || []

  // Period filtering (same approach as ReportExecutionService.filterRowsByPeriod)
  if (params.dateColumnKey && params.cadence && params.periodKey) {
    const cadence = params.cadence as ReportCadence
    rows = rows.filter((row) => {
      const dateValue = row[params.dateColumnKey!]
      if (dateValue === null || dateValue === undefined) return false
      const rowPeriodKey = periodKeyFromValue(dateValue, cadence)
      return rowPeriodKey === params.periodKey
    })
  }

  // If column keys specified, only include those columns
  if (params.columnKeys && params.columnKeys.length > 0) {
    const keys = new Set(params.columnKeys)
    rows = rows.map((row) => {
      const filtered: Record<string, unknown> = {}
      for (const key of keys) {
        if (key in row) {
          filtered[key] = row[key]
        }
      }
      return filtered
    })
  }

  return { rows, totalRows: rows.length }
}

// ── Run Population ────────────────────────────────────────────────────

interface PopulateRunParams {
  runId: string
  organizationId: string
  sourceAConfig: SourceConfig
  sourceBConfig: SourceConfig
  /** Period key for filtering database rows (e.g. "2026-01") */
  periodKey?: string
}

/**
 * Populate a reconciliation run's sourceARows/sourceBRows from database sources.
 * Only loads data for sources with sourceType === "database".
 * Returns the row counts loaded for each side.
 */
export async function populateRunFromDatabases(params: PopulateRunParams): Promise<{
  sourceARowCount: number
  sourceBRowCount: number
}> {
  let sourceARowCount = 0
  let sourceBRowCount = 0

  // Load Source A if it's a database source
  if (params.sourceAConfig.sourceType === "database" && params.sourceAConfig.databaseId) {
    const columnKeys = params.sourceAConfig.columns.map((c) => c.key)
    const { rows, totalRows } = await loadDatabaseRows({
      databaseId: params.sourceAConfig.databaseId,
      organizationId: params.organizationId,
      columnKeys,
      dateColumnKey: params.sourceAConfig.dateColumnKey,
      cadence: params.sourceAConfig.cadence,
      periodKey: params.periodKey,
    })

    await ReconciliationService.updateRunSource(params.runId, params.organizationId, "A", {
      fileKey: `database:${params.sourceAConfig.databaseId}`,
      fileName: params.sourceAConfig.label,
      rows: rows as Record<string, any>[],
      totalRows,
    })
    sourceARowCount = totalRows
  }

  // Load Source B if it's a database source
  if (params.sourceBConfig.sourceType === "database" && params.sourceBConfig.databaseId) {
    const columnKeys = params.sourceBConfig.columns.map((c) => c.key)
    const { rows, totalRows } = await loadDatabaseRows({
      databaseId: params.sourceBConfig.databaseId,
      organizationId: params.organizationId,
      columnKeys,
      dateColumnKey: params.sourceBConfig.dateColumnKey,
      cadence: params.sourceBConfig.cadence,
      periodKey: params.periodKey,
    })

    await ReconciliationService.updateRunSource(params.runId, params.organizationId, "B", {
      fileKey: `database:${params.sourceBConfig.databaseId}`,
      fileName: params.sourceBConfig.label,
      rows: rows as Record<string, any>[],
      totalRows,
    })
    sourceBRowCount = totalRows
  }

  return { sourceARowCount, sourceBRowCount }
}
