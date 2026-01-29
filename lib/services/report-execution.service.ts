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
  type: "source" | "formula"
  sourceColumnKey?: string
  expression?: string
  format: string
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
    const { reportDefinitionId, organizationId, currentPeriodKey, compareMode = "none" } = input

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

    // Evaluate based on layout
    let table: ExecutePreviewResult["table"]

    if (layout === "pivot") {
      table = this.evaluatePivotLayout(report, currentRows, compareRows)
    } else {
      table = this.evaluateStandardLayout(report, currentRows, compareRows)
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
    const columns: TableColumn[] = [
      { key: "_label", label: "", dataType: "text", type: "source" },
      ...pivotValues.map(pv => ({
        key: pv,
        label: pv,
        dataType: "text",
        type: "source" as const,
      }))
    ]

    // Sort metrics by order
    const sortedMetrics = [...metricRows].sort((a, b) => a.order - b.order)

    // Build metric values for current period
    const metricValuesByPivot: Record<string, Record<string, number | null>> = {}
    // Build metric values for compare period (for comparison rows)
    const compareMetricValuesByPivot: Record<string, Record<string, number | null>> = {}

    // Initialize
    for (const pv of pivotValues) {
      metricValuesByPivot[pv] = {}
      compareMetricValuesByPivot[pv] = {}
    }

    // First pass: compute source values (current period)
    for (const pv of pivotValues) {
      for (const metric of sortedMetrics) {
        if (metric.type === "source" && metric.sourceColumnKey) {
          const num = parseNumericValue(currentDataByPivot[pv]?.[metric.sourceColumnKey])
          metricValuesByPivot[pv][metric.key] = num
          // Also compute compare period source values
          if (compareRows) {
            const compareNum = parseNumericValue(compareDataByPivot[pv]?.[metric.sourceColumnKey])
            compareMetricValuesByPivot[pv][metric.key] = compareNum
          }
        }
      }
    }

    // Second pass: compute formula values (can reference other metrics)
    for (const pv of pivotValues) {
      for (const metric of sortedMetrics) {
        if (metric.type === "formula" && metric.expression) {
          // Build context with other metric values for this pivot
          const context: Record<string, number> = {}
          for (const [key, val] of Object.entries(metricValuesByPivot[pv])) {
            if (val !== null) {
              context[key] = val
            }
          }
          metricValuesByPivot[pv][metric.key] = evaluateSafeExpression(metric.expression, context)

          // Also compute compare period formula values
          if (compareRows) {
            const compareContext: Record<string, number> = {}
            for (const [key, val] of Object.entries(compareMetricValuesByPivot[pv])) {
              if (val !== null) {
                compareContext[key] = val
              }
            }
            compareMetricValuesByPivot[pv][metric.key] = evaluateSafeExpression(metric.expression, compareContext)
          }
        }
      }
    }

    // Third pass: compute comparison rows
    for (const pv of pivotValues) {
      for (const metric of sortedMetrics) {
        if (metric.type === "comparison" && metric.compareRowKey) {
          const currentValue = metricValuesByPivot[pv][metric.compareRowKey]
          const compareValue = compareMetricValuesByPivot[pv][metric.compareRowKey]

          if (currentValue === null || compareValue === null) {
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

    // Build output rows
    const dataRows = sortedMetrics.map(metric => {
      const row: Record<string, unknown> = { _label: metric.label }
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
