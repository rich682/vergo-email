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

export interface SourceConfig {
  label: string
  columns: SourceColumnDef[]
}

export interface MatchingRules {
  amountMatch: "exact" | "tolerance"
  amountTolerance?: number
  dateWindowDays: number
  fuzzyDescription: boolean
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
    sourceAConfig: SourceConfig
    sourceBConfig: SourceConfig
    matchingRules: MatchingRules
    createdById?: string
  }) {
    return prisma.reconciliationConfig.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        sourceAConfig: data.sourceAConfig as any,
        sourceBConfig: data.sourceBConfig as any,
        matchingRules: data.matchingRules as any,
        ...(data.createdById && { createdById: data.createdById }),
      },
    })
  }

  /** Update a config */
  static async updateConfig(
    configId: string,
    organizationId: string,
    data: { name?: string; sourceAConfig?: SourceConfig; sourceBConfig?: SourceConfig; matchingRules?: MatchingRules }
  ) {
    return prisma.reconciliationConfig.updateMany({
      where: { id: configId, organizationId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sourceAConfig && { sourceAConfig: data.sourceAConfig as any }),
        ...(data.sourceBConfig && { sourceBConfig: data.sourceBConfig as any }),
        ...(data.matchingRules && { matchingRules: data.matchingRules as any }),
      },
    })
  }

  /** Delete a config and all its runs */
  static async deleteConfig(configId: string, organizationId: string) {
    return prisma.reconciliationConfig.deleteMany({
      where: { id: configId, organizationId },
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
