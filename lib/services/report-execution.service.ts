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
} from "@/lib/utils/safe-expression"

// ============================================
// Types
// ============================================

export interface ExecutePreviewInput {
  reportDefinitionId: string
  organizationId: string
  currentPeriodKey?: string  // Optional - if not provided, uses all rows
  compareMode?: CompareMode  // Default: "none"
  liveConfig?: {             // Optional - override saved config for live preview
    columns?: any[]
    formulaRows?: any[]
    pivotColumnKey?: string | null
    metricRows?: any[]
  }
  filters?: Record<string, unknown>  // Optional - column-value filters from slice
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

// Types from report-definition.service
interface ReportColumn {
  key: string
  label: string
  type: "source" | "formula"
  sourceColumnKey?: string
  expression?: string
  dataType: string
  order: number
}

interface ReportFormulaRow {
  key: string
  label: string
  columnFormulas: Record<string, string>
  order: number
}

interface MetricRow {
  key: string
  label: string
  type: "source" | "formula" | "comparison"
  sourceColumnKey?: string
  expression?: string
  // Comparison fields
  compareRowKey?: string
  comparePeriod?: "mom" | "qoq" | "yoy"
  compareOutput?: "value" | "delta" | "percent"
  format: "text" | "number" | "currency" | "percent"
  order: number
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
    } : report

    const cadence = report.cadence as ReportCadence
    const dateColumnKey = report.dateColumnKey
    const layout = report.layout as "standard" | "pivot"
    const allRows = (report.database.rows || []) as Array<Record<string, unknown>>

    // Get available periods from the data
    const availablePeriods = getPeriodsFromRows(allRows, dateColumnKey, cadence)

    // Diagnostics
    const diagnostics = {
      totalDatabaseRows: allRows.length,
      parseFailures: 0,
      warnings: [] as string[],
    }

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
      table = this.evaluatePivotLayout(effectiveReport, currentRows, compareRows)
    } else {
      table = this.evaluateStandardLayout(effectiveReport, currentRows, compareRows)
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
    report: any,
    currentRows: Array<Record<string, unknown>>,
    compareRows: Array<Record<string, unknown>> | null
  ): ExecutePreviewResult["table"] {
    const reportColumns = (report.columns || []) as ReportColumn[]
    const reportFormulaRows = (report.formulaRows || []) as ReportFormulaRow[]

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
    report: any,
    currentRows: Array<Record<string, unknown>>,
    compareRows: Array<Record<string, unknown>> | null
  ): ExecutePreviewResult["table"] {
    const pivotColumnKey = report.pivotColumnKey as string | null
    const metricRows = (report.metricRows || []) as MetricRow[]

    if (!pivotColumnKey || metricRows.length === 0) {
      return { columns: [], rows: [], formulaRows: [] }
    }

    // Get unique pivot values from current rows
    const pivotValues = [...new Set(
      currentRows.map(r => String(r[pivotColumnKey] || ""))
    )].filter(v => v !== "").sort()

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

    // Build columns: first is label column, rest are pivot values
    // Note: dataType on columns is "text" as a fallback; actual formatting is per-row via _format
    const columns: TableColumn[] = [
      { key: "_label", label: "", dataType: "text", type: "source" },
      ...pivotValues.map(pv => ({
        key: pv,
        label: pv,
        dataType: "number" as const, // Default; actual format comes from row
        type: "source" as const,
      }))
    ]

    // Sort metrics by order
    const sortedMetrics = [...metricRows].sort((a, b) => a.order - b.order)

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
              // Percentage change: (current - compare) / compare * 100
              if (compareValue === 0) {
                metricValuesByPivot[pv][metric.key] = null
              } else {
                metricValuesByPivot[pv][metric.key] = Math.round(((currentValue - compareValue) / compareValue) * 10000) / 100
              }
              break
            default:
              metricValuesByPivot[pv][metric.key] = compareValue
          }
        }
      }
    }

    // Build output rows with format information
    const dataRows = sortedMetrics.map(metric => {
      const row: Record<string, unknown> = { 
        _label: metric.label,
        _format: metric.format, // Include format for frontend rendering
      }
      for (const pv of pivotValues) {
        row[pv] = metricValuesByPivot[pv][metric.key]
      }
      return row
    })

    return { columns, rows: dataRows, formulaRows: [] }
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
          const fn = upperFormula === "AVERAGE" ? "AVG" : upperFormula
          const columnValues = extractColumnValues(currentRows, sourceKey)
          values[columnKey] = computeAggregate(fn as any, columnValues)
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
      }
    })
  }
}
