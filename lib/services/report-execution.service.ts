/**
 * Report Execution Service
 * 
 * Server-side report preview execution with period filtering and variance analysis.
 * This replaces the client-side useMemo computation in the report builder.
 */

import { prisma } from "@/lib/prisma"
import {
  type ReportCadence,
  type CompareMode,
  periodKeyFromValue,
  labelForPeriodKey,
  resolveComparePeriod,
  getPeriodsFromRows,
} from "@/lib/utils/period"
import {
  evaluateSafeExpression,
  parseAggregateExpression,
  parseSimpleAggregateExpression,
  parseNumericValue,
  computeAggregate,
  extractColumnValues,
  type AggregateFunction,
} from "@/lib/utils/safe-expression"
import type {
  ReportColumn,
  ReportFormulaRow,
  MetricRow,
  PivotFormulaColumn,
} from "./report-definition.service"

// ============================================
// Types
// ============================================

export interface ExecutePreviewInput {
  reportDefinitionId: string
  organizationId: string
  currentPeriodKey?: string  // Optional - if not provided, uses all rows
  compareMode?: CompareMode  // Default: "none"
  liveConfig?: {             // Optional - override saved config for live preview
    columns?: ReportColumn[]
    formulaRows?: ReportFormulaRow[]
    pivotColumnKey?: string | null
    metricRows?: MetricRow[]
    pivotFormulaColumns?: PivotFormulaColumn[]  // Formula columns for pivot layout
    pivotSortConfig?: { type: string; direction: string; rowKey?: string } | null
  }
  filters?: Record<string, string[]>  // Optional - column-value filters
}

export interface PeriodInfo {
  periodKey: string
  label: string
  rowCount: number
}

export interface TableColumn {
  key: string
  label: string
  dataType: string
  type: "source" | "formula"
}

export interface FormulaRowOutput {
  key: string
  label: string
  values: Record<string, unknown>
  _bold?: boolean
  _separatorAbove?: boolean
}

export interface ExecutePreviewResult {
  current: PeriodInfo | null
  compare: PeriodInfo | null
  availablePeriods: Array<{ key: string; label: string }>
  table: {
    columns: TableColumn[]
    rows: Array<Record<string, unknown>>
    formulaRows: FormulaRowOutput[]
  }
  diagnostics: {
    totalDatabaseRows: number
    parseFailures: number
    warnings: string[]
  }
}

// ReportWithConfig - internal type for report with all config fields
// Used in evaluate functions
interface ReportWithConfig {
  columns?: ReportColumn[]
  formulaRows?: ReportFormulaRow[]
  pivotColumnKey?: string | null
  metricRows?: MetricRow[]
  pivotFormulaColumns?: PivotFormulaColumn[]
  // Accounting layout fields
  rowColumnKey?: string | null
  valueColumnKey?: string | null
  cadence: ReportCadence
  dateColumnKey: string
  layout: "standard" | "pivot" | "accounting"
  compareMode?: "none" | "mom" | "yoy"
  pivotSortConfig?: { type: string; direction: string; rowKey?: string } | null
}

// ============================================
// Service
// ============================================

export class ReportExecutionService {
  /**
   * Execute a report preview with optional period filtering and comparison
   */
  static async executePreview(input: ExecutePreviewInput): Promise<ExecutePreviewResult> {
    const { reportDefinitionId, organizationId, currentPeriodKey, compareMode = "none", liveConfig, filters } = input

    // Load report definition with database
    const report = await prisma.reportDefinition.findFirst({
      where: { id: reportDefinitionId, organizationId },
      include: {
        database: {
          select: {
            id: true,
            name: true,
            schema: true,
            rows: true,
            rowCount: true,
          },
        },
      },
    })

    if (!report) {
      throw new Error("Report not found")
    }

    // Apply liveConfig overrides if provided (for preview without saving)
    const effectiveReport = liveConfig ? {
      ...report,
      columns: liveConfig.columns ?? report.columns,
      formulaRows: liveConfig.formulaRows ?? report.formulaRows,
      pivotColumnKey: liveConfig.pivotColumnKey !== undefined ? liveConfig.pivotColumnKey : report.pivotColumnKey,
      metricRows: liveConfig.metricRows ?? report.metricRows,
      pivotFormulaColumns: liveConfig.pivotFormulaColumns ?? report.pivotFormulaColumns,
      pivotSortConfig: liveConfig.pivotSortConfig !== undefined ? liveConfig.pivotSortConfig : (report as any).pivotSortConfig,
    } : report

    const cadence = report.cadence as ReportCadence
    const dateColumnKey = report.dateColumnKey
    const layout = report.layout as "standard" | "pivot" | "accounting"
    const allRows = (report.database.rows || []) as Array<Record<string, unknown>>

    // Diagnostics
    const diagnostics = {
      totalDatabaseRows: allRows.length,
      parseFailures: 0,
      warnings: [] as string[],
    }

    // Accounting layout: skip period filtering entirely — all rows used, dates ARE the columns
    if (layout === "accounting") {
      let currentRows = allRows

      // Apply column-value filters if any
      if (filters && Object.keys(filters).length > 0) {
        currentRows = this.filterRowsByColumnValues(currentRows, filters)
      }

      const table = this.evaluateAccountingLayout(effectiveReport as any, currentRows)

      return {
        current: null,
        compare: null,
        availablePeriods: [],
        table,
        diagnostics,
      }
    }

    // Get available periods from the data
    const availablePeriods = getPeriodsFromRows(allRows, dateColumnKey, cadence)

    // Filter rows by period
    let currentRows: Array<Record<string, unknown>>
    let compareRows: Array<Record<string, unknown>> | null = null
    let currentInfo: PeriodInfo | null = null
    let compareInfo: PeriodInfo | null = null

    if (currentPeriodKey) {
      // Filter to current period
      const filterResult = this.filterRowsByPeriod(allRows, dateColumnKey, currentPeriodKey, cadence)
      currentRows = filterResult.rows
      diagnostics.parseFailures += filterResult.parseFailures

      currentInfo = {
        periodKey: currentPeriodKey,
        label: labelForPeriodKey(currentPeriodKey, cadence),
        rowCount: currentRows.length,
      }

      // Handle compare period
      if (compareMode !== "none") {
        const comparePeriodKey = resolveComparePeriod(currentPeriodKey, cadence, compareMode)
        if (comparePeriodKey) {
          const compareResult = this.filterRowsByPeriod(allRows, dateColumnKey, comparePeriodKey, cadence)
          compareRows = compareResult.rows
          diagnostics.parseFailures += compareResult.parseFailures

          compareInfo = {
            periodKey: comparePeriodKey,
            label: labelForPeriodKey(comparePeriodKey, cadence),
            rowCount: compareRows.length,
          }
        }
      }
    } else {
      // No period filtering - use all rows
      currentRows = allRows
    }

    // Apply column-value filters (from slice filterBindings)
    if (filters && Object.keys(filters).length > 0) {
      currentRows = this.filterRowsByColumnValues(currentRows, filters)

      // Update row count in currentInfo if it exists
      if (currentInfo) {
        currentInfo.rowCount = currentRows.length
      }

      // Also filter compare rows if they exist
      if (compareRows) {
        compareRows = this.filterRowsByColumnValues(compareRows, filters)
        if (compareInfo) {
          compareInfo.rowCount = compareRows.length
        }
      }
    }

    // Evaluate based on layout
    let table: ExecutePreviewResult["table"]

    if (layout === "pivot") {
      table = this.evaluatePivotLayout(effectiveReport as any, currentRows, compareRows)
    } else {
      table = this.evaluateStandardLayout(effectiveReport as any, currentRows, compareRows)
    }

    return {
      current: currentInfo,
      compare: compareInfo,
      availablePeriods,
      table,
      diagnostics,
    }
  }

  /**
   * Filter rows by period key
   */
  private static filterRowsByPeriod(
    rows: Array<Record<string, unknown>>,
    dateColumnKey: string,
    targetPeriodKey: string,
    cadence: ReportCadence
  ): { rows: Array<Record<string, unknown>>; parseFailures: number } {
    const filtered: Array<Record<string, unknown>> = []
    let parseFailures = 0

    for (const row of rows) {
      const dateValue = row[dateColumnKey]
      const rowPeriodKey = periodKeyFromValue(dateValue, cadence)

      if (rowPeriodKey === null) {
        parseFailures++
        continue
      }

      if (rowPeriodKey === targetPeriodKey) {
        filtered.push(row)
      }
    }

    return { rows: filtered, parseFailures }
  }

  /**
   * Filter rows by column-value filters (from slice filterBindings)
   * 
   * Filtering rules (V1):
   * - filters is a map of columnKey -> expectedValue
   * - A row matches if for every filter key:
   *   - row[key] exists and equals expectedValue (strict equality for primitives)
   *   - If expectedValue is an array, treat it as "IN" (row[key] in expectedValue array)
   *   - If filter value is null/undefined: ignore that filter key
   *   - If a filter key doesn't exist on the row at all: row fails (excluded)
   */
  private static filterRowsByColumnValues(
    rows: Array<Record<string, unknown>>,
    filters: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    // Get active filter entries (non-null/undefined values)
    const activeFilters = Object.entries(filters).filter(
      ([_, value]) => value !== null && value !== undefined
    )

    if (activeFilters.length === 0) {
      return rows
    }

    return rows.filter(row => {
      for (const [key, expectedValue] of activeFilters) {
        // If row doesn't have the key, exclude it
        if (!(key in row)) {
          return false
        }

        const rowValue = row[key]

        // Handle array filter (IN operator)
        if (Array.isArray(expectedValue)) {
          if (!expectedValue.includes(rowValue)) {
            return false
          }
        } else {
          // Strict equality for primitives
          if (rowValue !== expectedValue) {
            return false
          }
        }
      }
      return true
    })
  }

  /**
   * Evaluate standard layout (rows = data rows, columns = selected columns)
   */
  private static evaluateStandardLayout(
    report: ReportWithConfig,
    currentRows: Array<Record<string, unknown>>,
    compareRows: Array<Record<string, unknown>> | null
  ): ExecutePreviewResult["table"] {
    const reportColumns = report.columns || []
    const reportFormulaRows = report.formulaRows || []

    if (reportColumns.length === 0) {
      return { columns: [], rows: [], formulaRows: [] }
    }

    // Sort columns by order
    const sortedColumns = [...reportColumns].sort((a, b) => a.order - b.order)

    // Build output columns
    const columns: TableColumn[] = sortedColumns.map(col => ({
      key: col.key,
      label: col.label,
      dataType: col.dataType,
      type: col.type,
    }))

    // Limit rows for preview
    const limitedRows = currentRows.slice(0, 100)

    // Compute data rows
    const dataRows = limitedRows.map(sourceRow => {
      const outputRow: Record<string, unknown> = {}

      for (const col of sortedColumns) {
        if (col.type === "source" && col.sourceColumnKey) {
          outputRow[col.key] = sourceRow[col.sourceColumnKey]
        } else if (col.type === "formula" && col.expression) {
          // Build context for formula evaluation
          const context: Record<string, number> = {}
          for (const c of sortedColumns) {
            if (c.type === "source" && c.sourceColumnKey) {
              const num = parseNumericValue(sourceRow[c.sourceColumnKey])
              if (num !== null) {
                context[c.sourceColumnKey] = num
              }
            }
          }
          outputRow[col.key] = evaluateSafeExpression(col.expression, context)
        }
      }

      return outputRow
    })

    // Compute formula rows (aggregations)
    const formulaRows = this.computeFormulaRows(
      reportFormulaRows,
      sortedColumns,
      currentRows,
      compareRows
    )

    return { columns, rows: dataRows, formulaRows }
  }

  /**
   * Evaluate pivot layout (rows = metrics, columns = pivot values)
   */
  private static evaluatePivotLayout(
    report: ReportWithConfig,
    currentRows: Array<Record<string, unknown>>,
    compareRows: Array<Record<string, unknown>> | null
  ): ExecutePreviewResult["table"] {
    const pivotColumnKey = report.pivotColumnKey
    const metricRows = report.metricRows || []

    if (!pivotColumnKey || metricRows.length === 0) {
      return { columns: [], rows: [], formulaRows: [] }
    }

    // Get unique pivot values from current rows (unsorted — will sort after metric computation)
    let pivotValues = [...new Set(
      currentRows.map(r => String(r[pivotColumnKey] || ""))
    )].filter(v => v !== "")

    if (pivotValues.length === 0) {
      return { columns: [], rows: [], formulaRows: [] }
    }

    // Build data map: { pivotValue: rowData }
    const currentDataByPivot: Record<string, Record<string, unknown>> = {}
    for (const row of currentRows) {
      const pivotVal = String(row[pivotColumnKey] || "")
      if (pivotVal) {
        currentDataByPivot[pivotVal] = row
      }
    }

    // Build compare data map if available
    const compareDataByPivot: Record<string, Record<string, unknown>> = {}
    if (compareRows) {
      for (const row of compareRows) {
        const pivotVal = String(row[pivotColumnKey] || "")
        if (pivotVal) {
          compareDataByPivot[pivotVal] = row
        }
      }
    }

    // Sort metrics by order and ensure format is set
    const sortedMetrics = [...metricRows]
      .map(m => ({
        ...m,
        format: m.format || "number", // Default to number if format is missing
      }))
      .sort((a, b) => a.order - b.order)

    // Build metric values for current period - store as unknown to support text
    const metricValuesByPivot: Record<string, Record<string, unknown>> = {}
    // Build numeric values for compare period (for comparison calculations)
    const numericMetricsByPivot: Record<string, Record<string, number | null>> = {}
    const compareNumericMetricsByPivot: Record<string, Record<string, number | null>> = {}

    // Initialize
    for (const pv of pivotValues) {
      metricValuesByPivot[pv] = {}
      numericMetricsByPivot[pv] = {}
      compareNumericMetricsByPivot[pv] = {}
    }

    // First pass: compute source values (current period)
    for (const pv of pivotValues) {
      for (const metric of sortedMetrics) {
        if (metric.type === "source" && metric.sourceColumnKey) {
          const rawValue = currentDataByPivot[pv]?.[metric.sourceColumnKey]
          
          // For text format, store the raw value directly
          if (metric.format === "text") {
            metricValuesByPivot[pv][metric.key] = rawValue ?? null
          } else {
            // For numeric formats, parse as number
            const num = parseNumericValue(rawValue)
            metricValuesByPivot[pv][metric.key] = num
            numericMetricsByPivot[pv][metric.key] = num
          }
          
          // Also compute compare period source values (only for numeric)
          if (compareRows && metric.format !== "text") {
            const compareRaw = compareDataByPivot[pv]?.[metric.sourceColumnKey]
            const compareNum = parseNumericValue(compareRaw)
            compareNumericMetricsByPivot[pv][metric.key] = compareNum
          }
        }
      }
    }

    // Second pass: compute formula values (can reference other metrics)
    for (const pv of pivotValues) {
      for (const metric of sortedMetrics) {
        if (metric.type === "formula" && metric.expression) {
          // Build context with numeric metric values for this pivot
          const context: Record<string, number> = {}
          for (const [key, val] of Object.entries(numericMetricsByPivot[pv])) {
            if (val !== null) {
              context[key] = val
            }
          }
          const result = evaluateSafeExpression(metric.expression, context)
          metricValuesByPivot[pv][metric.key] = result
          numericMetricsByPivot[pv][metric.key] = result

          // Also compute compare period formula values
          if (compareRows) {
            const compareContext: Record<string, number> = {}
            for (const [key, val] of Object.entries(compareNumericMetricsByPivot[pv])) {
              if (val !== null) {
                compareContext[key] = val
              }
            }
            compareNumericMetricsByPivot[pv][metric.key] = evaluateSafeExpression(metric.expression, compareContext)
          }
        }
      }
    }

    // Third pass: compute comparison rows
    for (const pv of pivotValues) {
      for (const metric of sortedMetrics) {
        if (metric.type === "comparison" && metric.compareRowKey) {
          const currentValue = numericMetricsByPivot[pv][metric.compareRowKey]
          const compareValue = compareNumericMetricsByPivot[pv][metric.compareRowKey]

          if (currentValue === null || currentValue === undefined || 
              compareValue === null || compareValue === undefined) {
            metricValuesByPivot[pv][metric.key] = null
            continue
          }

          // Calculate based on output type
          switch (metric.compareOutput) {
            case "value":
              // Just show the compare period value
              metricValuesByPivot[pv][metric.key] = compareValue
              break
            case "delta":
              // Current - Compare (positive = growth)
              metricValuesByPivot[pv][metric.key] = Math.round((currentValue - compareValue) * 100) / 100
              break
            case "percent":
              // Percentage change as ratio: (current - compare) / compare
              // Frontend formatter handles ×100 display for percent format
              if (compareValue === 0) {
                metricValuesByPivot[pv][metric.key] = null
              } else {
                metricValuesByPivot[pv][metric.key] = (currentValue - compareValue) / compareValue
              }
              break
            default:
              metricValuesByPivot[pv][metric.key] = compareValue
          }
        }
      }
    }

    // Sort pivot values according to config (after all metric values are computed)
    const sortConfig = (report as ReportWithConfig).pivotSortConfig
    pivotValues = this.sortPivotValues(pivotValues, sortConfig, metricValuesByPivot)

    // Build columns: first is label column, rest are sorted pivot values
    const columns: TableColumn[] = [
      { key: "_label", label: "", dataType: "text", type: "source" },
      ...pivotValues.map(pv => ({
        key: pv,
        label: pv,
        dataType: "number" as const,
        type: "source" as const,
      }))
    ]

    // Get formula columns for pivot layout
    const pivotFormulaColumns = (report.pivotFormulaColumns || []) as PivotFormulaColumn[]
    const sortedFormulaColumns = [...pivotFormulaColumns].sort((a, b) => a.order - b.order)

    // Add formula columns to output columns
    for (const fc of sortedFormulaColumns) {
      columns.push({
        key: fc.key,
        label: fc.label,
        dataType: "number",
        type: "formula",
      })
    }

    // Build output rows with format and type information
    const dataRows = sortedMetrics.map(metric => {
      const row: Record<string, unknown> = {
        _label: metric.label,
        _format: metric.format, // Include format for frontend rendering
        _type: metric.type, // Include type to show formula/comparison icons
        _bold: metric.isBold || false,
        _separatorAbove: metric.separatorAbove || false,
      }
      for (const pv of pivotValues) {
        row[pv] = metricValuesByPivot[pv][metric.key]
      }
      
      // Compute formula column values for this row
      for (const fc of sortedFormulaColumns) {
        row[fc.key] = this.evaluatePivotFormulaColumn(fc.expression, row, pivotValues)
      }
      
      return row
    })

    return { columns, rows: dataRows, formulaRows: [] }
  }

  /**
   * Evaluate accounting layout - proper pivot table for accounting data.
   * Row column = identifies each row (e.g., Account Name)
   * Pivot column = values become column headers (e.g., as_of_date → "2026-01-31", "2026-02-28")
   * Value column = cell values (e.g., Current Balance)
   * Auto-generated Variance column (last - first)
   */
  private static evaluateAccountingLayout(
    report: ReportWithConfig,
    allRows: Array<Record<string, unknown>>
  ): ExecutePreviewResult["table"] {
    const rowColumnKey = report.rowColumnKey
    const pivotColumnKey = report.pivotColumnKey
    const valueColumnKey = report.valueColumnKey

    if (!rowColumnKey || !pivotColumnKey || !valueColumnKey) {
      return { columns: [], rows: [], formulaRows: [] }
    }

    if (allRows.length === 0) {
      return { columns: [], rows: [], formulaRows: [] }
    }

    // Extract unique row identifiers (preserving first-appearance order)
    const rowIdOrder: string[] = []
    const rowIdSet = new Set<string>()
    for (const row of allRows) {
      const rowId = String(row[rowColumnKey] ?? "")
      if (rowId && !rowIdSet.has(rowId)) {
        rowIdSet.add(rowId)
        rowIdOrder.push(rowId)
      }
    }

    // Extract unique pivot values
    const pivotValueSet = new Set<string>()
    for (const row of allRows) {
      const pv = String(row[pivotColumnKey] ?? "")
      if (pv) pivotValueSet.add(pv)
    }
    const sortConfig = (report as ReportWithConfig).pivotSortConfig
    const sortDirection = sortConfig?.direction || "asc"
    const pivotValues = [...pivotValueSet].sort((a, b) => {
      const cmp = a.localeCompare(b)
      return sortDirection === "desc" ? -cmp : cmp
    })

    if (rowIdOrder.length === 0 || pivotValues.length === 0) {
      return { columns: [], rows: [], formulaRows: [] }
    }

    // Build lookup: { rowId: { pivotVal: numericValue } }
    const lookup: Record<string, Record<string, number | null>> = {}
    for (const rowId of rowIdOrder) {
      lookup[rowId] = {}
    }

    for (const row of allRows) {
      const rowId = String(row[rowColumnKey] ?? "")
      const pv = String(row[pivotColumnKey] ?? "")
      if (!rowId || !pv) continue

      const rawValue = row[valueColumnKey]
      let num: number | null = null
      if (typeof rawValue === "number") {
        num = rawValue
      } else if (typeof rawValue === "string" && rawValue !== "" && !isNaN(Number(rawValue))) {
        num = Number(rawValue)
      }

      if (lookup[rowId]) {
        lookup[rowId][pv] = num
      }
    }

    // Build table columns: [_label, ...pivotValues, _variance]
    const columns: TableColumn[] = [
      { key: "_label", label: "", dataType: "text", type: "source" },
      ...pivotValues.map(pv => ({
        key: pv,
        label: pv,
        dataType: "currency" as const,
        type: "source" as const,
      })),
      { key: "_variance", label: "Variance", dataType: "currency", type: "formula" },
    ]

    // Build data rows: one per unique row identifier
    const dataRows = rowIdOrder.map(rowId => {
      const row: Record<string, unknown> = {
        _label: rowId,
        _format: "currency",
      }

      for (const pv of pivotValues) {
        row[pv] = lookup[rowId][pv] ?? null
      }

      // Variance = last pivot value - first pivot value
      const firstVal = lookup[rowId][pivotValues[0]]
      const lastVal = lookup[rowId][pivotValues[pivotValues.length - 1]]
      if (firstVal !== null && firstVal !== undefined && lastVal !== null && lastVal !== undefined) {
        row["_variance"] = Math.round((lastVal - firstVal) * 100) / 100
      } else {
        row["_variance"] = null
      }

      return row
    })

    // Apply pivotFormulaColumns if any (reuse existing evaluatePivotFormulaColumn)
    const pivotFormulaColumns = (report.pivotFormulaColumns || []) as PivotFormulaColumn[]
    const sortedFormulaColumns = [...pivotFormulaColumns].sort((a, b) => a.order - b.order)

    // Add formula columns to output columns (before variance)
    for (const fc of sortedFormulaColumns) {
      // Insert before the variance column
      columns.splice(columns.length - 1, 0, {
        key: fc.key,
        label: fc.label,
        dataType: "currency",
        type: "formula",
      })
    }

    // Compute formula column values for each row
    for (const row of dataRows) {
      for (const fc of sortedFormulaColumns) {
        row[fc.key] = this.evaluatePivotFormulaColumn(fc.expression, row, pivotValues)
      }
    }

    return { columns, rows: dataRows, formulaRows: [] }
  }

  /**
   * Sort pivot column values according to the sort configuration.
   * For "by_row" sorting, metricValuesByPivot must be pre-computed.
   */
  private static sortPivotValues(
    pivotValues: string[],
    sortConfig: { type: string; direction: string; rowKey?: string } | null | undefined,
    metricValuesByPivot?: Record<string, Record<string, unknown>>
  ): string[] {
    const direction = sortConfig?.direction || "asc"

    // Default or alphabetical: sort by pivot value string
    if (!sortConfig || sortConfig.type === "alphabetical") {
      return [...pivotValues].sort((a, b) => {
        const cmp = a.localeCompare(b)
        return direction === "desc" ? -cmp : cmp
      })
    }

    // Sort by a metric row's value
    if (sortConfig.type === "by_row" && sortConfig.rowKey && metricValuesByPivot) {
      const rowKey = sortConfig.rowKey
      return [...pivotValues].sort((a, b) => {
        const valA = metricValuesByPivot[a]?.[rowKey]
        const valB = metricValuesByPivot[b]?.[rowKey]

        // Text values: alphabetical comparison
        if (typeof valA === "string" || typeof valB === "string") {
          const strA = String(valA ?? "")
          const strB = String(valB ?? "")
          const cmp = strA.localeCompare(strB)
          return direction === "desc" ? -cmp : cmp
        }

        // Numeric values
        const numA = typeof valA === "number" ? valA : -Infinity
        const numB = typeof valB === "number" ? valB : -Infinity
        return direction === "asc" ? numA - numB : numB - numA
      })
    }

    // Fallback: alphabetical ascending
    return [...pivotValues].sort((a, b) => a.localeCompare(b))
  }

  /**
   * Evaluate a formula column expression for a single row
   * Supports:
   * - SUM(*) - sum all pivot columns
   * - AVG(*) - average all pivot columns
   * - MIN(*), MAX(*) - min/max of all pivot columns
   * - [Col A] + [Col B] - reference specific columns by label
   */
  private static evaluatePivotFormulaColumn(
    expression: string,
    row: Record<string, unknown>,
    pivotValues: string[]
  ): number | null {
    const trimmedExpr = expression.trim().toUpperCase()
    
    // Handle aggregate functions with wildcard: SUM(*), AVG(*), MIN(*), MAX(*)
    const wildcardMatch = trimmedExpr.match(/^(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\s*\(\s*\*\s*\)$/i)
    if (wildcardMatch) {
      const fn = wildcardMatch[1].toUpperCase()
      
      // Collect all numeric values from pivot columns
      const values: number[] = []
      for (const pv of pivotValues) {
        const val = row[pv]
        if (typeof val === "number" && !isNaN(val)) {
          values.push(val)
        } else if (typeof val === "string" && !isNaN(Number(val))) {
          values.push(Number(val))
        }
      }
      
      if (values.length === 0) return null
      
      switch (fn) {
        case "SUM":
          return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100
        case "AVG":
        case "AVERAGE":
          return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
        case "MIN":
          return Math.min(...values)
        case "MAX":
          return Math.max(...values)
        case "COUNT":
          return values.length
        default:
          return null
      }
    }
    
    // Handle column references: [Col A] + [Col B]
    // Replace [column label] with the actual value from the row
    let evalExpr = expression
    const columnRefPattern = /\[([^\]]+)\]/g
    let match
    
    while ((match = columnRefPattern.exec(expression)) !== null) {
      const columnLabel = match[1]
      // Find the pivot value that matches this label
      const val = row[columnLabel]
      let numVal = 0
      
      if (typeof val === "number" && !isNaN(val)) {
        numVal = val
      } else if (typeof val === "string" && !isNaN(Number(val))) {
        numVal = Number(val)
      } else if (val === null || val === undefined) {
        numVal = 0
      }
      
      evalExpr = evalExpr.replace(match[0], String(numVal))
    }
    
    // Evaluate the resulting arithmetic expression
    // Only allow numbers, operators, parentheses, and spaces
    if (!/^[\d\s+\-*/().]+$/.test(evalExpr)) {
      return null
    }
    
    try {
      // eslint-disable-next-line no-eval
      const result = Function(`"use strict"; return (${evalExpr})`)()
      if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
        return Math.round(result * 100) / 100
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Compute formula rows (aggregations) with dual-context support
   */
  private static computeFormulaRows(
    formulaRows: ReportFormulaRow[],
    columns: ReportColumn[],
    currentRows: Array<Record<string, unknown>>,
    compareRows: Array<Record<string, unknown>> | null
  ): FormulaRowOutput[] {
    const sortedFormulaRows = [...formulaRows].sort((a, b) => a.order - b.order)

    return sortedFormulaRows.map(fr => {
      const values: Record<string, unknown> = {}

      for (const [columnKey, formula] of Object.entries(fr.columnFormulas)) {
        // Find the column to get source key
        const column = columns.find(c => c.key === columnKey)
        const sourceKey = column?.type === "source" ? column.sourceColumnKey : columnKey

        if (!sourceKey) {
          values[columnKey] = null
          continue
        }

        // Try to parse as dual-context aggregate (e.g., "SUM(current.revenue)")
        const dualContextAgg = parseAggregateExpression(formula)
        if (dualContextAgg) {
          const rows = dualContextAgg.context === "compare" ? compareRows : currentRows
          if (!rows) {
            values[columnKey] = null
            continue
          }
          const columnValues = extractColumnValues(rows, dualContextAgg.column)
          values[columnKey] = computeAggregate(dualContextAgg.fn, columnValues)
          continue
        }

        // Try to parse as simple aggregate (e.g., "SUM" or "SUM(revenue)")
        const upperFormula = formula.toUpperCase().trim()
        const simpleAgg = parseSimpleAggregateExpression(formula)
        
        // Check if it's just a function name (e.g., "SUM")
        if (["SUM", "AVG", "COUNT", "MIN", "MAX", "AVERAGE"].includes(upperFormula)) {
          const fn: AggregateFunction = upperFormula === "AVERAGE" ? "AVG" : upperFormula as AggregateFunction
          const columnValues = extractColumnValues(currentRows, sourceKey)
          values[columnKey] = computeAggregate(fn, columnValues)
          continue
        }

        // Check for SUM(column) format
        if (simpleAgg) {
          const columnValues = extractColumnValues(currentRows, simpleAgg.column)
          values[columnKey] = computeAggregate(simpleAgg.fn, columnValues)
          continue
        }

        // Unknown formula
        values[columnKey] = null
      }

      return {
        key: fr.key,
        label: fr.label,
        values,
        _bold: fr.isBold || false,
        _separatorAbove: fr.separatorAbove || false,
      }
    })
  }
}
