/**
 * ReportGenerationService
 * 
 * Handles generation and storage of period-specific reports.
 * Called when a board with REPORTS tasks completes to snapshot
 * the report output for that accounting period.
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
  taskInstanceId: string | null  // null for manual reports
  boardId: string | null  // null for manual reports
  periodKey: string
  source: "task" | "manual"
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
  taskInstance?: {
    id: string
    name: string
  } | null
  board?: {
    id: string
    name: string
    periodStart: Date | null
    periodEnd: Date | null
  } | null
}

export interface GenerateReportInput {
  organizationId: string
  reportDefinitionId: string
  filterBindings?: Record<string, string[]>  // Dynamic filters { columnKey: [values] }
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
  viewerUserId?: string  // If provided, only return reports this user can view
}

export interface CreateManualReportInput {
  organizationId: string
  reportDefinitionId: string
  filterBindings?: Record<string, string[]>
  periodKey: string
  createdBy: string
  name?: string  // Custom report name (optional)
}

// ============================================
// Service
// ============================================

export class ReportGenerationService {
  /**
   * Generate and store a report for a specific period (task-triggered)
   */
  static async generateForPeriod(input: GenerateReportInput): Promise<GeneratedReport> {
    const {
      organizationId,
      reportDefinitionId,
      filterBindings,
      taskInstanceId,
      boardId,
      periodKey,
      generatedBy = "system",
    } = input

    // Get report definition for metadata
    const reportDef = await prisma.reportDefinition.findFirst({
      where: { id: reportDefinitionId, organizationId },
    })

    if (!reportDef) {
      throw new Error("Report definition not found")
    }

    // Build filter name for display
    let filterName: string | undefined
    if (filterBindings && Object.keys(filterBindings).length > 0) {
      const filterParts = Object.entries(filterBindings)
        .filter(([_, values]) => values.length > 0)
        .map(([key, values]) => {
          if (values.length === 1) {
            return values[0]
          }
          return `${values.length} ${key}`
        })
      if (filterParts.length > 0) {
        filterName = filterParts.join(", ")
      }
    }

    // Execute the report with period and filters
    const result = await ReportExecutionService.executePreview({
      reportDefinitionId,
      organizationId,
      currentPeriodKey: periodKey,
      compareMode: (reportDef.compareMode as "none" | "mom" | "yoy") || "none",
      filters: filterBindings,
    })

    // Build the data snapshot
    const data: GeneratedReportData = {
      current: result.current,
      compare: result.compare,
      table: result.table,
      reportName: reportDef.name,
      sliceName: filterName,
      layout: reportDef.layout,
    }

    // Store in database
    const generated = await prismaAny.generatedReport.create({
      data: {
        organizationId,
        reportDefinitionId,
        taskInstanceId,
        boardId,
        periodKey,
        source: "task",
        data: data,
        generatedBy,
      },
      include: {
        reportDefinition: {
          select: { id: true, name: true, cadence: true, layout: true },
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
   * Create a manual report (not tied to a task)
   */
  static async createManualReport(input: CreateManualReportInput): Promise<GeneratedReport> {
    const {
      organizationId,
      reportDefinitionId,
      filterBindings,
      periodKey,
      createdBy,
      name,
    } = input

    // Get report definition for metadata
    const reportDef = await prisma.reportDefinition.findFirst({
      where: { id: reportDefinitionId, organizationId },
    })

    if (!reportDef) {
      throw new Error("Report definition not found")
    }

    // Build filter name for display
    let filterName: string | undefined
    if (filterBindings && Object.keys(filterBindings).length > 0) {
      const filterParts = Object.entries(filterBindings)
        .filter(([_, values]) => values.length > 0)
        .map(([key, values]) => {
          if (values.length === 1) {
            return values[0]
          }
          return `${values.length} ${key}`
        })
      if (filterParts.length > 0) {
        filterName = filterParts.join(", ")
      }
    }

    // Execute the report with period and filters
    const result = await ReportExecutionService.executePreview({
      reportDefinitionId,
      organizationId,
      currentPeriodKey: periodKey,
      compareMode: (reportDef.compareMode as "none" | "mom" | "yoy") || "none",
      filters: filterBindings,
    })

    // Build the data snapshot
    const data: GeneratedReportData = {
      current: result.current,
      compare: result.compare,
      table: result.table,
      reportName: name || reportDef.name,  // Use custom name if provided
      sliceName: filterName,
      layout: reportDef.layout,
    }

    // Store in database (no taskInstance or board for manual reports)
    const generated = await prismaAny.generatedReport.create({
      data: {
        organizationId,
        reportDefinitionId,
        taskInstanceId: null,
        boardId: null,
        periodKey,
        source: "manual",
        data: data,
        generatedBy: createdBy,
      },
      include: {
        reportDefinition: {
          select: { id: true, name: true, cadence: true, layout: true },
        },
      },
    })

    return this.mapToGeneratedReport(generated)
  }

  /**
   * List generated reports with filters
   */
  static async list(input: ListGeneratedReportsInput): Promise<GeneratedReport[]> {
    const { organizationId, reportDefinitionId, periodKey, boardId, limit = 100, viewerUserId } = input

    const where: {
      organizationId: string
      reportDefinitionId?: string
      periodKey?: string
      boardId?: string
      viewers?: { some: { userId: string } }
    } = { organizationId }

    if (reportDefinitionId) {
      where.reportDefinitionId = reportDefinitionId
    }

    if (periodKey) {
      where.periodKey = periodKey
    }

    if (boardId) {
      where.boardId = boardId
    }

    // Non-admin filter: only show reports where user is a viewer
    if (viewerUserId) {
      where.viewers = { some: { userId: viewerUserId } }
    }

    const reports = await prismaAny.generatedReport.findMany({
      where,
      include: {
        reportDefinition: {
          select: { id: true, name: true, cadence: true, layout: true },
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
   * If viewerUserId is provided, only return periods from reports the user can view
   */
  static async getDistinctPeriods(organizationId: string, viewerUserId?: string): Promise<string[]> {
    const where: {
      organizationId: string
      viewers?: { some: { userId: string } }
    } = { organizationId }

    // Non-admin filter: only periods from reports where user is a viewer
    if (viewerUserId) {
      where.viewers = { some: { userId: viewerUserId } }
    }

    const results = await prismaAny.generatedReport.findMany({
      where,
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
      taskInstanceId: data.taskInstanceId,
      boardId: data.boardId,
      periodKey: data.periodKey,
      source: data.source || "task",
      data: data.data as GeneratedReportData,
      generatedAt: data.generatedAt,
      generatedBy: data.generatedBy,
      reportDefinition: data.reportDefinition,
      taskInstance: data.taskInstance || null,
      board: data.board || null,
    }
  }
}
