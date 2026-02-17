/**
 * ReportDefinition Service
 * 
 * Business logic for the Reports feature - Excel-like report templates
 * that render data from Databases with computed columns and formula rows.
 * 
 * Key concepts:
 * - Source columns: Data pulled directly from the Database
 * - Formula columns: Computed values per row (like Excel calculated columns)
 * - Formula rows: Aggregations at the bottom (like Excel SUM/AVG rows)
 */

import { prisma } from "@/lib/prisma"
import { DatabaseSchema, DatabaseRow } from "./database.service"

// ============================================
// Types
// ============================================

export interface ReportColumn {
  key: string                    // Unique key for this column
  label: string                  // Display header
  type: "source" | "formula"     // Source = from DB, Formula = computed
  sourceColumnKey?: string       // If type="source", which DB column
  expression?: string            // If type="formula", the formula expression
  dataType: "text" | "number" | "currency" | "date" | "boolean"
  width?: number
  order: number
}

export interface ReportFormulaRow {
  key: string                    // Unique key for this row
  label: string                  // Row label (e.g., "Total", "Average")
  columnFormulas: {              // Per-column aggregation formulas
    [columnKey: string]: string  // e.g., { "revenue": "SUM", "cost": "SUM", "margin": "AVG" }
  }
  order: number
}

// Metric row for pivot layout
export interface MetricRow {
  key: string                    // Unique key for this metric row
  label: string                  // Display label (e.g., "Construction Income", "GP%")
  type: "source" | "formula" | "comparison"  // Source = from DB, Formula = calculated, Comparison = period compare
  sourceColumnKey?: string       // If type="source", which DB column to pull from
  expression?: string            // If type="formula", expression using other row keys
  // Comparison fields (type="comparison")
  compareRowKey?: string         // Which row to compare (references another metric row's key)
  comparePeriod?: "mom" | "qoq" | "yoy"  // Month-over-month, Quarter-over-quarter, Year-over-year
  compareOutput?: "value" | "delta" | "percent"  // Output: raw value, difference, or percentage change
  format: "text" | "number" | "currency" | "percent"
  order: number
}

// Comparison period types for metric rows
export type ComparePeriodType = "mom" | "qoq" | "yoy"
export type CompareOutputType = "value" | "delta" | "percent"

// Formula column for pivot layout - computed columns that aggregate across pivot columns
export interface PivotFormulaColumn {
  key: string                    // Unique key for this column (e.g., "total_col")
  label: string                  // Display label (e.g., "Total", "Combo")
  expression: string             // Formula: "SUM(*)" for all, or "[Col A] + [Col B]" for specific
  order: number                  // Position after auto-generated pivot columns
}

// Valid cadence values for reports
export type ReportCadence = "daily" | "monthly" | "quarterly" | "annual"

// Layout modes
export type ReportLayout = "standard" | "pivot" | "accounting"

// Compare modes for variance analysis
export type CompareMode = "none" | "mom" | "yoy"

export interface CreateReportDefinitionInput {
  name: string
  description?: string
  databaseId: string
  cadence: ReportCadence
  dateColumnKey: string
  layout?: ReportLayout
  compareMode?: CompareMode
  // Standard layout fields
  columns?: ReportColumn[]
  formulaRows?: ReportFormulaRow[]
  // Pivot layout fields
  pivotColumnKey?: string
  metricRows?: MetricRow[]
  pivotFormulaColumns?: PivotFormulaColumn[]  // Formula columns for pivot layout
  // Accounting layout fields
  rowColumnKey?: string
  valueColumnKey?: string
  organizationId: string
  createdById: string
}

export interface UpdateReportDefinitionInput {
  name?: string
  description?: string
  cadence?: ReportCadence
  layout?: ReportLayout
  compareMode?: CompareMode
  // Standard layout fields
  columns?: ReportColumn[]
  formulaRows?: ReportFormulaRow[]
  // Pivot layout fields
  pivotColumnKey?: string
  metricRows?: MetricRow[]
  pivotFormulaColumns?: PivotFormulaColumn[]  // Formula columns for pivot layout
  // Accounting layout fields
  rowColumnKey?: string
  valueColumnKey?: string
  // Filter configuration - which database columns to expose as filters
  filterColumnKeys?: string[]
  // Baked-in filter values: { "location": ["Bixby, OK"], "pm": ["Caleb"] }
  filterBindings?: Record<string, string[]> | null
}

export interface ReportPreviewResult {
  columns: Array<{
    key: string
    label: string
    dataType: string
    type: "source" | "formula"
  }>
  dataRows: Array<Record<string, unknown>>
  formulaRows: Array<{
    key: string
    label: string
    values: Record<string, unknown>
  }>
  metadata: {
    rowCount: number
    databaseName: string
    databaseId: string
  }
}

// ============================================
// Service
// ============================================

export class ReportDefinitionService {
  /**
   * List all report definitions for an organization
   */
  static async listReportDefinitions(organizationId: string) {
    const reports = await prisma.reportDefinition.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        database: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return reports.map(report => ({
      ...report,
      columnCount: (report.columns as unknown as ReportColumn[])?.length || 0,
    }))
  }

  /**
   * Get a single report definition by ID
   */
  static async getReportDefinition(id: string, organizationId: string) {
    const report = await prisma.reportDefinition.findFirst({
      where: { id, organizationId },
      include: {
        database: {
          select: {
            id: true,
            name: true,
            schema: true,
            rowCount: true,
            rows: true, // Include rows for live preview
          },
        },
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
        viewers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { addedAt: "asc" },
        },
      },
    })

    return report
  }

  /**
   * Create a new report definition
   */
  static async createReportDefinition(input: CreateReportDefinitionInput) {
    // Verify database exists and belongs to org
    const database = await prisma.database.findFirst({
      where: { id: input.databaseId, organizationId: input.organizationId },
    })

    if (!database) {
      throw new Error("Database not found")
    }

    // Validate dateColumnKey exists in database schema
    const schema = database.schema as unknown as DatabaseSchema
    const dateColumnExists = schema.columns.some(col => col.key === input.dateColumnKey)
    if (!dateColumnExists) {
      throw new Error(`Date column "${input.dateColumnKey}" not found in database schema`)
    }

    // Validate cadence
    const validCadences = ["daily", "monthly", "quarterly", "annual"]
    if (!validCadences.includes(input.cadence)) {
      throw new Error(`Invalid cadence "${input.cadence}". Must be one of: ${validCadences.join(", ")}`)
    }

    // Validate layout
    const layout = input.layout || "standard"
    const validLayouts = ["standard", "pivot", "accounting"]
    if (!validLayouts.includes(layout)) {
      throw new Error(`Invalid layout "${layout}". Must be one of: ${validLayouts.join(", ")}`)
    }

    // Validate pivot layout requirements
    if (layout === "pivot" && !input.pivotColumnKey) {
      throw new Error("Pivot layout requires a pivot column")
    }

    // Validate accounting layout requirements
    if (layout === "accounting") {
      if (!input.pivotColumnKey) {
        throw new Error("Accounting layout requires a pivot column (dates)")
      }
      if (!input.rowColumnKey) {
        throw new Error("Accounting layout requires a row column")
      }
      if (!input.valueColumnKey) {
        throw new Error("Accounting layout requires a value column")
      }
    }

    // Validate pivotColumnKey exists in database schema if provided
    if (input.pivotColumnKey) {
      const pivotColumnExists = schema.columns.some(col => col.key === input.pivotColumnKey)
      if (!pivotColumnExists) {
        throw new Error(`Pivot column "${input.pivotColumnKey}" not found in database schema`)
      }
    }

    const report = await prisma.reportDefinition.create({
      data: {
        name: input.name,
        description: input.description,
        organizationId: input.organizationId,
        databaseId: input.databaseId,
        cadence: input.cadence,
        dateColumnKey: input.dateColumnKey,
        layout,
        compareMode: input.compareMode || "none",
        columns: (input.columns || []) as any,
        formulaRows: (input.formulaRows || []) as any,
        pivotColumnKey: input.pivotColumnKey,
        rowColumnKey: input.rowColumnKey,
        valueColumnKey: input.valueColumnKey,
        metricRows: (input.metricRows || []) as any,
        pivotFormulaColumns: (input.pivotFormulaColumns || []) as any,
        createdById: input.createdById,
      },
      include: {
        database: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return report
  }

  /**
   * Update a report definition
   */
  static async updateReportDefinition(
    id: string,
    organizationId: string,
    input: UpdateReportDefinitionInput
  ) {
    const existing = await prisma.reportDefinition.findFirst({
      where: { id, organizationId },
    })

    if (!existing) {
      throw new Error("Report definition not found")
    }

    const report = await prisma.reportDefinition.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.cadence !== undefined && { cadence: input.cadence }),
        ...(input.layout !== undefined && { layout: input.layout }),
        ...(input.compareMode !== undefined && { compareMode: input.compareMode }),
        // Standard layout fields
        ...(input.columns !== undefined && { columns: input.columns as any }),
        ...(input.formulaRows !== undefined && { formulaRows: input.formulaRows as any }),
        // Pivot layout fields
        ...(input.pivotColumnKey !== undefined && { pivotColumnKey: input.pivotColumnKey }),
        ...(input.metricRows !== undefined && { metricRows: input.metricRows as any }),
        ...(input.pivotFormulaColumns !== undefined && { pivotFormulaColumns: input.pivotFormulaColumns as any }),
        // Accounting layout fields
        ...(input.rowColumnKey !== undefined && { rowColumnKey: input.rowColumnKey }),
        ...(input.valueColumnKey !== undefined && { valueColumnKey: input.valueColumnKey }),
        // Filter configuration
        ...(input.filterColumnKeys !== undefined && { filterColumnKeys: input.filterColumnKeys }),
        ...(input.filterBindings !== undefined && { filterBindings: input.filterBindings as any }),
      },
      include: {
        database: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return report
  }

  /**
   * Duplicate a report definition with a new name
   */
  static async duplicateReportDefinition(
    id: string,
    organizationId: string,
    newName: string,
    createdById: string
  ) {
    const existing = await prisma.reportDefinition.findFirst({
      where: { id, organizationId },
    })

    if (!existing) {
      throw new Error("Report definition not found")
    }

    // Check for duplicate name within the org
    const nameExists = await prisma.reportDefinition.findFirst({
      where: { organizationId, name: newName },
      select: { id: true },
    })

    if (nameExists) {
      throw new Error(`A report with the name "${newName}" already exists`)
    }

    const report = await prisma.reportDefinition.create({
      data: {
        name: newName,
        description: existing.description,
        organizationId,
        databaseId: existing.databaseId,
        cadence: existing.cadence,
        dateColumnKey: existing.dateColumnKey,
        layout: existing.layout,
        compareMode: existing.compareMode,
        columns: existing.columns as any,
        formulaRows: existing.formulaRows as any,
        pivotColumnKey: existing.pivotColumnKey,
        rowColumnKey: existing.rowColumnKey,
        valueColumnKey: existing.valueColumnKey,
        metricRows: existing.metricRows as any,
        pivotFormulaColumns: existing.pivotFormulaColumns as any,
        filterColumnKeys: existing.filterColumnKeys as any,
        filterBindings: existing.filterBindings as any,
        createdById,
      },
      include: {
        database: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return report
  }

  /**
   * Delete a report definition
   */
  static async deleteReportDefinition(id: string, organizationId: string) {
    const existing = await prisma.reportDefinition.findFirst({
      where: { id, organizationId },
    })

    if (!existing) {
      throw new Error("Report definition not found")
    }

    await prisma.reportDefinition.delete({
      where: { id },
    })

    return { deleted: true }
  }

  /**
   * Set viewers for a report definition (replaces full list)
   */
  static async setViewers(
    reportDefinitionId: string,
    organizationId: string,
    userIds: string[],
    addedBy: string
  ) {
    // Verify report exists
    const report = await prisma.reportDefinition.findFirst({
      where: { id: reportDefinitionId, organizationId },
    })
    if (!report) {
      throw new Error("Report definition not found")
    }

    // Replace all viewers in a transaction
    await prisma.$transaction([
      prisma.reportDefinitionViewer.deleteMany({
        where: { reportDefinitionId },
      }),
      ...(userIds.length > 0
        ? [
            prisma.reportDefinitionViewer.createMany({
              data: userIds.map((userId) => ({
                reportDefinitionId,
                userId,
                addedBy,
              })),
            }),
          ]
        : []),
    ])

    // Return updated viewers
    const viewers = await prisma.reportDefinitionViewer.findMany({
      where: { reportDefinitionId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { addedAt: "asc" },
    })

    return viewers
  }

  /**
   * Check if a user is a viewer of a report definition
   */
  static async isViewer(reportDefinitionId: string, userId: string): Promise<boolean> {
    const viewer = await prisma.reportDefinitionViewer.findFirst({
      where: { reportDefinitionId, userId },
      select: { id: true },
    })
    return !!viewer
  }

  /**
   * Render a preview of the report with sample data
   */
  static async renderPreview(
    id: string,
    organizationId: string,
    options?: { limit?: number }
  ): Promise<ReportPreviewResult> {
    const limit = options?.limit || 100

    // Get report definition with database
    const report = await prisma.reportDefinition.findFirst({
      where: { id, organizationId },
      include: {
        database: true,
      },
    })

    if (!report) {
      throw new Error("Report definition not found")
    }

    const database = report.database
    const databaseRows = (database.rows as unknown as DatabaseRow[]) || []
    const reportColumns = (report.columns as unknown as ReportColumn[]) || []
    const reportFormulaRows = (report.formulaRows as unknown as ReportFormulaRow[]) || []

    // Limit rows for preview
    const sourceRows = databaseRows.slice(0, limit)

    // Build output columns metadata
    const outputColumns = reportColumns
      .sort((a, b) => a.order - b.order)
      .map(col => ({
        key: col.key,
        label: col.label,
        dataType: col.dataType,
        type: col.type,
      }))

    // Compute data rows with formula columns
    const dataRows = sourceRows.map(sourceRow => {
      const outputRow: Record<string, unknown> = {}

      for (const col of reportColumns) {
        if (col.type === "source" && col.sourceColumnKey) {
          // Direct value from database
          outputRow[col.key] = sourceRow[col.sourceColumnKey]
        } else if (col.type === "formula" && col.expression) {
          // Evaluate formula expression
          outputRow[col.key] = evaluateRowFormula(col.expression, sourceRow, col.dataType)
        }
      }

      return outputRow
    })

    // Compute formula rows (aggregations)
    const formulaRowsOutput = reportFormulaRows
      .sort((a, b) => a.order - b.order)
      .map(fr => ({
        key: fr.key,
        label: fr.label,
        values: computeFormulaRowValues(fr.columnFormulas, dataRows, reportColumns),
      }))

    return {
      columns: outputColumns,
      dataRows,
      formulaRows: formulaRowsOutput,
      metadata: {
        rowCount: sourceRows.length,
        databaseName: database.name,
        databaseId: database.id,
      },
    }
  }
}

// ============================================
// Formula Evaluation Helpers
// ============================================

/**
 * Evaluate a formula expression for a single row
 * Supports simple arithmetic: column references, +, -, *, /, parentheses
 */
function evaluateRowFormula(
  expression: string,
  row: DatabaseRow,
  dataType: string
): unknown {
  try {
    // Replace column references with values
    // Column references are identified by alphanumeric keys (no spaces)
    let expr = expression

    // Find all potential column references (words)
    const columnRefs = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
    
    for (const ref of columnRefs) {
      if (ref in row) {
        const value = row[ref]
        if (typeof value === "number") {
          expr = expr.replace(new RegExp(`\\b${ref}\\b`, "g"), String(value))
        } else if (typeof value === "string" && !isNaN(Number(value))) {
          expr = expr.replace(new RegExp(`\\b${ref}\\b`, "g"), value)
        } else {
          // Non-numeric value, replace with 0
          expr = expr.replace(new RegExp(`\\b${ref}\\b`, "g"), "0")
        }
      }
    }

    // Safely evaluate the arithmetic expression
    // Only allow numbers, operators, parentheses, and spaces
    if (!/^[\d\s+\-*/().]+$/.test(expr)) {
      return null
    }

    // eslint-disable-next-line no-eval
    const result = Function(`"use strict"; return (${expr})`)()

    if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
      // Round to 2 decimal places for display
      return Math.round(result * 100) / 100
    }

    return null
  } catch {
    return null
  }
}

/**
 * Compute formula row values (aggregations like SUM, AVG, COUNT)
 */
function computeFormulaRowValues(
  columnFormulas: Record<string, string>,
  dataRows: Array<Record<string, unknown>>,
  reportColumns: ReportColumn[]
): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const [columnKey, formula] of Object.entries(columnFormulas)) {
    const upperFormula = formula.toUpperCase().trim()
    
    // Extract numeric values for this column
    const numericValues: number[] = dataRows
      .map(row => {
        const val = row[columnKey]
        if (typeof val === "number") return val
        if (typeof val === "string" && !isNaN(Number(val))) return Number(val)
        return null
      })
      .filter((v): v is number => v !== null)

    if (numericValues.length === 0) {
      values[columnKey] = null
      continue
    }

    // Evaluate aggregation function
    switch (upperFormula) {
      case "SUM":
        values[columnKey] = Math.round(numericValues.reduce((a, b) => a + b, 0) * 100) / 100
        break
      case "AVG":
      case "AVERAGE":
        values[columnKey] = Math.round((numericValues.reduce((a, b) => a + b, 0) / numericValues.length) * 100) / 100
        break
      case "COUNT":
        values[columnKey] = numericValues.length
        break
      case "MIN":
        values[columnKey] = Math.min(...numericValues)
        break
      case "MAX":
        values[columnKey] = Math.max(...numericValues)
        break
      default:
        // Custom formula - evaluate as expression using the aggregated values
        // For now, just return null for custom expressions
        values[columnKey] = null
    }
  }

  return values
}
