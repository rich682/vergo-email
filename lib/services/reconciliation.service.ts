/**
 * ReconciliationService - CRUD operations for reconciliation configs and runs
 */
import { prisma } from "@/lib/prisma"
import { ReconciliationRunStatus } from "@prisma/client"

// ── Types ──────────────────────────────────────────────────────────────

export interface SourceColumnDef {
  key: string
  label: string
  type: "date" | "amount" | "text" | "reference"
}

export interface ExtractionProfile {
  documentDescription?: string    // "JPM corporate credit card statement"
  extractionHints?: string        // "Transactions in Purchasing/Travel Activity sections, page 2+"
  sourceFormat?: "pdf" | "excel" | "database"
  expectedColumns?: { name: string; type: string }[]
  sampleExtraction?: Record<string, any>[]
  lastUpdated?: string
}

export interface SourceConfig {
  label: string
  columns: SourceColumnDef[]
  // Database source metadata (only set for database sources)
  sourceType?: "file" | "database"
  databaseId?: string
  dateColumnKey?: string   // Period filtering column
  cadence?: string         // "daily" | "monthly" | "quarterly" | "annual"
  // AI extraction profile — document description and parsing hints
  extractionProfile?: ExtractionProfile
}

export interface MatchingRules {
  amountMatch: "exact" | "tolerance"
  amountTolerance?: number
  dateWindowDays: number
  fuzzyDescription: boolean
  columnTolerances?: Record<string, { type: string; tolerance: number }>
  // Template-driven strategy
  strategy?: "composite" | "amount_first"
  ignorePatterns?: string[]
  creditHandling?: "negative" | "positive" | "absolute"
}

export interface MatchingGuidelines {
  guidelines: string
  updatedAt: string
  updatedBy: string
}

export interface LearnedPattern {
  id: string
  type: "value_mapping" | "column_weight" | "description_alias" | "sign_convention" | "custom_rule"
  description: string
  details: Record<string, any>
  source: "auto" | "user"
  confidence: number
  createdFromRunId?: string
  createdAt: string
}

export interface MatchingStats {
  totalRuns: number
  avgMatchRate: number
  avgManualMatchRate: number
  commonExceptionCategories: { category: string; count: number }[]
  lastRunAt: string
}

export interface LearnedContext {
  patterns: LearnedPattern[]
  stats: MatchingStats
  lastLearnedFromRunId?: string
}

// ── Config CRUD ────────────────────────────────────────────────────────

export class ReconciliationService {
  /** List all configs for an organization, with latest run info and linked task count */
  static async listConfigs(organizationId: string) {
    return prisma.reconciliationConfig.findMany({
      where: { organizationId },
      include: {
        _count: { select: { taskInstances: true } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            matchedCount: true,
            exceptionCount: true,
            variance: true,
            createdAt: true,
            completedAt: true,
          },
        },
        viewers: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { addedAt: "asc" as const },
        },
      },
      orderBy: { updatedAt: "desc" },
    })
  }

  /** Get a single config with all its runs and linked tasks */
  static async getConfig(configId: string, organizationId: string) {
    return prisma.reconciliationConfig.findFirst({
      where: { id: configId, organizationId },
      include: {
        taskInstances: {
          select: { id: true, name: true, boardId: true, board: { select: { id: true, name: true } } },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            boardId: true,
            taskInstanceId: true,
            matchedCount: true,
            exceptionCount: true,
            variance: true,
            totalSourceA: true,
            totalSourceB: true,
            sourceAFileName: true,
            sourceBFileName: true,
            createdAt: true,
            completedAt: true,
          },
        },
        viewers: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { addedAt: "asc" as const },
        },
      },
    })
  }

  /** Get config linked to a task instance (via TaskInstance.reconciliationConfigId) */
  static async getConfigByTask(taskInstanceId: string, organizationId: string) {
    const task = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      select: { reconciliationConfigId: true },
    })
    if (!task?.reconciliationConfigId) return null

    return prisma.reconciliationConfig.findFirst({
      where: { id: task.reconciliationConfigId, organizationId },
      include: {
        runs: {
          where: { taskInstanceId },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    })
  }

  /** Create a new reconciliation config (standalone, not tied to any task) */
  static async createConfig(data: {
    organizationId: string
    name: string
    sourceType?: string
    sourceAConfig: SourceConfig
    sourceBConfig: SourceConfig
    matchingRules: MatchingRules
    matchingGuidelines?: MatchingGuidelines
    createdById?: string
    templateId?: string
    templateVersion?: number
  }) {
    return prisma.reconciliationConfig.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        sourceType: data.sourceType || "document_document",
        sourceAConfig: data.sourceAConfig as any,
        sourceBConfig: data.sourceBConfig as any,
        matchingRules: data.matchingRules as any,
        ...(data.matchingGuidelines && { matchingGuidelines: data.matchingGuidelines as any }),
        ...(data.createdById && { createdById: data.createdById }),
        ...(data.templateId && { templateId: data.templateId }),
        ...(data.templateVersion && { templateVersion: data.templateVersion }),
      },
    })
  }

  /** Update a config */
  static async updateConfig(
    configId: string,
    organizationId: string,
    data: {
      name?: string
      sourceAConfig?: SourceConfig
      sourceBConfig?: SourceConfig
      matchingRules?: MatchingRules
      matchingGuidelines?: MatchingGuidelines | null
      learnedContext?: LearnedContext | null
    }
  ) {
    return prisma.reconciliationConfig.updateMany({
      where: { id: configId, organizationId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sourceAConfig && { sourceAConfig: data.sourceAConfig as any }),
        ...(data.sourceBConfig && { sourceBConfig: data.sourceBConfig as any }),
        ...(data.matchingRules && { matchingRules: data.matchingRules as any }),
        ...(data.matchingGuidelines !== undefined && { matchingGuidelines: data.matchingGuidelines as any }),
        ...(data.learnedContext !== undefined && { learnedContext: data.learnedContext as any }),
      },
    })
  }

  /** Soft delete a config (runs are preserved via cascade) */
  static async deleteConfig(configId: string, organizationId: string, deletedById?: string) {
    const existing = await prisma.reconciliationConfig.findFirst({
      where: { id: configId, organizationId },
    })
    if (!existing) throw new Error("Reconciliation config not found")

    return prisma.reconciliationConfig.update({
      where: { id: configId },
      data: { deletedAt: new Date(), deletedById: deletedById ?? null },
    })
  }

  // ── Run CRUD ───────────────────────────────────────────────────────

  /** List runs for a config (excludes large JSON fields for performance) */
  static async listRuns(configId: string, organizationId: string) {
    return prisma.reconciliationRun.findMany({
      where: { configId, organizationId },
      select: {
        id: true,
        organizationId: true,
        configId: true,
        boardId: true,
        taskInstanceId: true,
        status: true,
        sourceAFileKey: true,
        sourceAFileName: true,
        sourceBFileKey: true,
        sourceBFileName: true,
        // Exclude: sourceARows, sourceBRows, matchResults, exceptions (large JSON)
        totalSourceA: true,
        totalSourceB: true,
        matchedCount: true,
        exceptionCount: true,
        variance: true,
        completedAt: true,
        completedBy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    })
  }

  /** Get a single run with full data */
  static async getRun(runId: string, organizationId: string) {
    return prisma.reconciliationRun.findFirst({
      where: { id: runId, organizationId },
      include: {
        config: true,
        completedByUser: { select: { id: true, name: true, email: true } },
      },
    })
  }

  /** Create a new run (optionally linked to a task) */
  static async createRun(data: { organizationId: string; configId: string; boardId?: string; taskInstanceId?: string }) {
    return prisma.reconciliationRun.create({
      data: {
        organizationId: data.organizationId,
        configId: data.configId,
        boardId: data.boardId,
        taskInstanceId: data.taskInstanceId,
        status: ReconciliationRunStatus.PENDING,
      },
    })
  }

  /** Update run with uploaded source data */
  static async updateRunSource(
    runId: string,
    organizationId: string,
    source: "A" | "B",
    data: { fileKey: string; fileName: string; rows: Record<string, any>[]; totalRows: number }
  ) {
    const updateData =
      source === "A"
        ? { sourceAFileKey: data.fileKey, sourceAFileName: data.fileName, sourceARows: data.rows as any, totalSourceA: data.totalRows }
        : { sourceBFileKey: data.fileKey, sourceBFileName: data.fileName, sourceBRows: data.rows as any, totalSourceB: data.totalRows }

    return prisma.reconciliationRun.updateMany({
      where: { id: runId, organizationId },
      data: updateData,
    })
  }

  /** Update run status */
  static async updateRunStatus(runId: string, organizationId: string, status: ReconciliationRunStatus) {
    return prisma.reconciliationRun.updateMany({
      where: { id: runId, organizationId },
      data: { status },
    })
  }

  /** Save match results */
  static async saveMatchResults(
    runId: string,
    organizationId: string,
    results: {
      matchResults: any
      exceptions: any
      matchedCount: number
      exceptionCount: number
      variance: number
    }
  ) {
    return prisma.reconciliationRun.updateMany({
      where: { id: runId, organizationId },
      data: {
        matchResults: results.matchResults,
        exceptions: results.exceptions,
        matchedCount: results.matchedCount,
        exceptionCount: results.exceptionCount,
        variance: results.variance,
        status: ReconciliationRunStatus.REVIEW,
      },
    })
  }

  /** Update exception resolutions */
  static async updateExceptions(runId: string, organizationId: string, exceptions: any) {
    return prisma.reconciliationRun.updateMany({
      where: { id: runId, organizationId },
      data: { exceptions },
    })
  }

  /**
   * Accept a manual match: move an unmatched pair into the matched list.
   * Supports many-to-one: pass a `sourceBIdxs` array to link multiple Source B
   * rows to a single Source A row. The scalar `sourceBIdx` form is preserved
   * for back-compat and 1:1 matches.
   */
  static async acceptManualMatch(
    runId: string,
    organizationId: string,
    sourceAIdx: number,
    sourceBIdxOrIdxs: number | number[]
  ) {
    const run = await prisma.reconciliationRun.findFirst({
      where: { id: runId, organizationId },
    })
    if (!run) throw new Error("Run not found")

    // Normalise to an array and de-dup
    const bIdxs = Array.from(new Set(
      Array.isArray(sourceBIdxOrIdxs) ? sourceBIdxOrIdxs : [sourceBIdxOrIdxs]
    ))
    if (bIdxs.length === 0) throw new Error("At least one Source B index required")
    const primaryBIdx = bIdxs[0]

    const matchResults = (run.matchResults as any) || { matched: [], unmatchedA: [], unmatchedB: [] }
    const exceptions = (run.exceptions as Record<string, any>) || {}

    // Snapshot row data for learning extraction on run completion
    const sourceARows = run.sourceARows as Record<string, any>[] | null
    const sourceBRows = run.sourceBRows as Record<string, any>[] | null

    // Add to matched list as manual match with row context.
    // For multi-B matches, `sourceBIdxs` holds all linked indices while
    // `sourceBIdx` holds the primary one so legacy consumers still work.
    matchResults.matched.push({
      sourceAIdx,
      sourceBIdx: primaryBIdx,
      ...(bIdxs.length > 1 && { sourceBIdxs: bIdxs }),
      confidence: 100,
      method: "manual",
      ...(sourceARows && sourceBRows && {
        context: {
          sourceAData: sourceARows[sourceAIdx],
          sourceBData: sourceBRows[primaryBIdx],
          ...(bIdxs.length > 1 && {
            sourceBDataAll: bIdxs.map((i) => sourceBRows[i]),
          }),
        },
      }),
    })

    // Remove from unmatched lists
    matchResults.unmatchedA = (matchResults.unmatchedA as number[]).filter((i: number) => i !== sourceAIdx)
    matchResults.unmatchedB = (matchResults.unmatchedB as number[]).filter((i: number) => !bIdxs.includes(i))

    // Remove related exceptions
    delete exceptions[`A-${sourceAIdx}`]
    for (const bIdx of bIdxs) delete exceptions[`B-${bIdx}`]

    const newExceptionCount = (matchResults.unmatchedA as number[]).length + (matchResults.unmatchedB as number[]).length

    await prisma.reconciliationRun.updateMany({
      where: { id: runId, organizationId },
      data: {
        matchResults,
        exceptions,
        matchedCount: (matchResults.matched as any[]).length,
        exceptionCount: newExceptionCount,
      },
    })

    return { matchResults, exceptions }
  }

  /** Complete a run (sign-off) */
  static async completeRun(runId: string, organizationId: string, userId: string) {
    return prisma.reconciliationRun.updateMany({
      where: { id: runId, organizationId },
      data: {
        status: ReconciliationRunStatus.COMPLETE,
        completedAt: new Date(),
        completedBy: userId,
      },
    })
  }

  /**
   * Set viewers for a reconciliation config (replaces full list)
   */
  static async setViewers(
    reconciliationConfigId: string,
    organizationId: string,
    userIds: string[],
    addedBy: string
  ) {
    const config = await prisma.reconciliationConfig.findFirst({
      where: { id: reconciliationConfigId, organizationId },
    })
    if (!config) {
      throw new Error("Reconciliation config not found")
    }

    await prisma.$transaction([
      prisma.reconciliationConfigViewer.deleteMany({
        where: { reconciliationConfigId },
      }),
      ...(userIds.length > 0
        ? [
            prisma.reconciliationConfigViewer.createMany({
              data: userIds.map((userId) => ({
                reconciliationConfigId,
                userId,
                addedBy,
              })),
            }),
          ]
        : []),
    ])

    const viewers = await prisma.reconciliationConfigViewer.findMany({
      where: { reconciliationConfigId },
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
   * Check if a user is a viewer of a reconciliation config
   */
  static async isViewer(reconciliationConfigId: string, userId: string): Promise<boolean> {
    const viewer = await prisma.reconciliationConfigViewer.findFirst({
      where: { reconciliationConfigId, userId },
      select: { id: true },
    })
    return !!viewer
  }
}
