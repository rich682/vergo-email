/**
 * ReportGenerationService
 * 
 * Handles generation and storage of period-specific reports.
 * Called when a board with REPORTS tasks completes to snapshot
 * the report output for that accounting period.
 * 
 * Note: Uses type assertions for Prisma models (generatedReport, reportSlice)
 * that are added via migration. These will work correctly after migration runs
 * and `prisma generate` regenerates the types.
 */

import { prisma } from "@/lib/prisma"
import { ReportExecutionService } from "./report-execution.service"

// Type-safe Prisma access - use 'any' until types regenerate after migration
const prismaAny = prisma as any

// ============================================
// Types
// ============================================

export interface GeneratedReportData {
  // Snapshot of the report execution result
  current: {
    periodKey: string
    label: string
    rowCount: number
  } | null
  compare?: {
    periodKey: string
    label: string
    rowCount: number
  } | null
  table: {
    columns: Array<{ key: string; label: string; dataType: string; type: string }>
    rows: Array<Record<string, unknown>>
    formulaRows?: Array<{ key: string; label: string; values: Record<string, unknown> }>
  }
  // Additional metadata
  reportName: string
  sliceName?: string
  layout: string
}

export interface GeneratedReport {
  id: string
  organizationId: string
  reportDefinitionId: string
  reportSliceId: string | null
  taskInstanceId: string
  boardId: string
  periodKey: string
  data: GeneratedReportData
  generatedAt: Date
  generatedBy: string
  // Joined data for display
  reportDefinition?: {
    id: string
    name: string
    cadence: string
    layout: string
  }
  reportSlice?: {
    id: string
    name: string
  } | null
  taskInstance?: {
    id: string
    name: string
  }
  board?: {
    id: string
    name: string
    periodStart: Date | null
    periodEnd: Date | null
  }
}

export interface GenerateReportInput {
  organizationId: string
  reportDefinitionId: string
  reportSliceId?: string
  taskInstanceId: string
  boardId: string
  periodKey: string
  generatedBy?: string // userId or "system"
}

export interface ListGeneratedReportsInput {
  organizationId: string
  reportDefinitionId?: string
  periodKey?: string
  boardId?: string
  limit?: number
}

// ============================================
// Service
// ============================================

export class ReportGenerationService {
  /**
   * Generate and store a report for a specific period
   */
  static async generateForPeriod(input: GenerateReportInput): Promise<GeneratedReport> {
    const {
      organizationId,
      reportDefinitionId,
      reportSliceId,
      taskInstanceId,
      boardId,
      periodKey,
      generatedBy = "system",
    } = input

    // Get slice filter bindings if slice is specified
    let filters: Record<string, unknown> | undefined
    let sliceName: string | undefined
    
    if (reportSliceId) {
      const slice = await prismaAny.reportSlice.findFirst({
        where: { id: reportSliceId, organizationId },
      })
      if (slice) {
        filters = slice.filterBindings as Record<string, unknown>
        sliceName = slice.name
      }
    }

    // Get report definition for metadata
    const reportDef = await prisma.reportDefinition.findFirst({
      where: { id: reportDefinitionId, organizationId },
    })

    if (!reportDef) {
      throw new Error("Report definition not found")
    }

    // Execute the report with period and filters
    const result = await ReportExecutionService.executePreview({
      reportDefinitionId,
      organizationId,
      currentPeriodKey: periodKey,
      compareMode: (reportDef.compareMode as "none" | "mom" | "yoy") || "none",
      filters,
    })

    // Build the data snapshot
    const data: GeneratedReportData = {
      current: result.current,
      compare: result.compare,
      table: result.table,
      reportName: reportDef.name,
      sliceName,
      layout: reportDef.layout,
    }

    // Store in database
    const generated = await prismaAny.generatedReport.create({
      data: {
        organizationId,
        reportDefinitionId,
        reportSliceId,
        taskInstanceId,
        boardId,
        periodKey,
        data: data,
        generatedBy,
      },
      include: {
        reportDefinition: {
          select: { id: true, name: true, cadence: true, layout: true },
        },
        reportSlice: {
          select: { id: true, name: true },
        },
        taskInstance: {
          select: { id: true, name: true },
        },
        board: {
          select: { id: true, name: true, periodStart: true, periodEnd: true },
        },
      },
    })

    return this.mapToGeneratedReport(generated)
  }

  /**
   * List generated reports with filters
   */
  static async list(input: ListGeneratedReportsInput): Promise<GeneratedReport[]> {
    const { organizationId, reportDefinitionId, periodKey, boardId, limit = 100 } = input

    const where: any = { organizationId }

    if (reportDefinitionId) {
      where.reportDefinitionId = reportDefinitionId
    }

    if (periodKey) {
      where.periodKey = periodKey
    }

    if (boardId) {
      where.boardId = boardId
    }

    const reports = await prismaAny.generatedReport.findMany({
      where,
      include: {
        reportDefinition: {
          select: { id: true, name: true, cadence: true, layout: true },
        },
        reportSlice: {
          select: { id: true, name: true },
        },
        taskInstance: {
          select: { id: true, name: true },
        },
        board: {
          select: { id: true, name: true, periodStart: true, periodEnd: true },
        },
      },
      orderBy: { generatedAt: "desc" },
      take: limit,
    })

    return reports.map(this.mapToGeneratedReport)
  }

  /**
   * Get a single generated report by ID
   */
  static async getById(
    id: string,
    organizationId: string
  ): Promise<GeneratedReport | null> {
    const report = await prismaAny.generatedReport.findFirst({
      where: { id, organizationId },
      include: {
        reportDefinition: {
          select: { id: true, name: true, cadence: true, layout: true },
        },
        reportSlice: {
          select: { id: true, name: true },
        },
        taskInstance: {
          select: { id: true, name: true },
        },
        board: {
          select: { id: true, name: true, periodStart: true, periodEnd: true },
        },
      },
    })

    return report ? this.mapToGeneratedReport(report) : null
  }

  /**
   * Get distinct period keys for filtering
   */
  static async getDistinctPeriods(organizationId: string): Promise<string[]> {
    const results = await prismaAny.generatedReport.findMany({
      where: { organizationId },
      select: { periodKey: true },
      distinct: ["periodKey"],
      orderBy: { periodKey: "desc" },
    })

    return results.map((r: { periodKey: string }) => r.periodKey)
  }

  /**
   * Map Prisma result to typed GeneratedReport
   */
  private static mapToGeneratedReport(data: any): GeneratedReport {
    return {
      id: data.id,
      organizationId: data.organizationId,
      reportDefinitionId: data.reportDefinitionId,
      reportSliceId: data.reportSliceId,
      taskInstanceId: data.taskInstanceId,
      boardId: data.boardId,
      periodKey: data.periodKey,
      data: data.data as GeneratedReportData,
      generatedAt: data.generatedAt,
      generatedBy: data.generatedBy,
      reportDefinition: data.reportDefinition,
      reportSlice: data.reportSlice,
      taskInstance: data.taskInstance,
      board: data.board,
    }
  }
}
