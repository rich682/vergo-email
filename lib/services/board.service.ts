import { prisma } from "@/lib/prisma"
import { Board, BoardStatus, BoardCadence, JobStatus } from "@prisma/client"
import { startOfWeek, endOfWeek, endOfMonth, endOfQuarter, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, format, isWeekend, nextMonday } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { TaskInstanceService } from "./task-instance.service"
import { ReportGenerationService } from "./report-generation.service"
import { canPerformAction, type OrgActionPermissions } from "@/lib/permissions"
import {
  calculateNextPeriodStart,
  getEndOfPeriod,
  generatePeriodBoardName,
  formatDateInTimezone,
  formatMonthYearInTimezone,
  getMonthInTimezone,
  getYearInTimezone,
} from "@/lib/utils/timezone"
import { periodKeyFromDate } from "@/lib/utils/period"

/**
 * Derive periodEnd from periodStart based on cadence type.
 * For QUARTERLY cadence, respects fiscal year start month to determine fiscal quarter boundaries.
 */
export function derivePeriodEnd(
  cadence: BoardCadence | null | undefined,
  periodStart: Date | null | undefined,
  options?: {
    fiscalYearStartMonth?: number // 1-12
  }
): Date | null {
  if (!cadence || !periodStart) return null
  
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1
  
  switch (cadence) {
    case "DAILY":
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
    case "WEEKLY":
      return endOfWeek(periodStart, { weekStartsOn: 1 })
    case "MONTHLY":
      return endOfMonth(periodStart)
    case "QUARTERLY": {
      if (fiscalYearStartMonth === 1) {
        // Standard calendar quarters
        return endOfQuarter(periodStart)
      }
      // Fiscal quarter: end is 3 months after start, minus 1 day
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      const monthsFromFiscalStart = (periodStart.getMonth() - fiscalMonthIndex + 12) % 12
      const fiscalQuarter = Math.floor(monthsFromFiscalStart / 3)
      // Quarter end is the last day of the 3rd month in the fiscal quarter
      const quarterEndMonthOffset = (fiscalQuarter + 1) * 3 - 1
      const quarterEndMonth = (fiscalMonthIndex + quarterEndMonthOffset) % 12
      let quarterEndYear = periodStart.getFullYear()
      // Handle year rollover: if we've wrapped around to earlier months
      if (quarterEndMonth < periodStart.getMonth() || 
          (quarterEndMonth < fiscalMonthIndex && periodStart.getMonth() >= fiscalMonthIndex)) {
        quarterEndYear++
      }
      return endOfMonth(new Date(quarterEndYear, quarterEndMonth, 1))
    }
    case "YEAR_END":
      return endOfYear(periodStart)
    case "AD_HOC":
      return null
    default:
      return null
  }
}

/**
 * Normalize periodStart based on cadence type.
 * For QUARTERLY cadence, respects fiscal year start month to determine fiscal quarter boundaries.
 */
export function normalizePeriodStart(
  cadence: BoardCadence | null | undefined,
  periodStart: Date | null | undefined,
  options?: {
    fiscalYearStartMonth?: number // 1-12
  }
): Date | null {
  if (!cadence || !periodStart) return null
  
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1
  
  switch (cadence) {
    case "DAILY":
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
    case "WEEKLY":
      return startOfWeek(periodStart, { weekStartsOn: 1 })
    case "MONTHLY":
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
    case "QUARTERLY": {
      if (fiscalYearStartMonth === 1) {
        // Standard calendar quarters
        const quarterMonth = Math.floor(periodStart.getMonth() / 3) * 3
        return new Date(periodStart.getFullYear(), quarterMonth, 1)
      }
      // Fiscal quarter start
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      const monthsFromFiscalStart = (periodStart.getMonth() - fiscalMonthIndex + 12) % 12
      const fiscalQuarter = Math.floor(monthsFromFiscalStart / 3)
      const quarterStartMonthOffset = fiscalQuarter * 3
      const quarterStartMonth = (fiscalMonthIndex + quarterStartMonthOffset) % 12
      let quarterStartYear = periodStart.getFullYear()
      // Handle year: if fiscal year starts later in calendar year and we're before it
      if (quarterStartMonth > periodStart.getMonth() && periodStart.getMonth() < fiscalMonthIndex) {
        quarterStartYear--
      }
      return new Date(quarterStartYear, quarterStartMonth, 1)
    }
    case "YEAR_END":
      return new Date(periodStart.getFullYear(), 0, 1)
    case "AD_HOC":
      return null
    default:
      return null
  }
}

// NOTE: calculateNextPeriodStart is now imported from @/lib/utils/timezone
// The timezone-aware version properly handles date calculations in the org's timezone
// Re-export for backwards compatibility with other modules
export { calculateNextPeriodStart } from "@/lib/utils/timezone"

// NOTE: formatDateInTimezone, formatMonthYearInTimezone, getMonthInTimezone, getYearInTimezone
// are now imported from @/lib/utils/timezone

// NOTE: generatePeriodBoardName is now imported from @/lib/utils/timezone
// Re-export for backwards compatibility with other modules
export { generatePeriodBoardName } from "@/lib/utils/timezone"

export interface CreateBoardData {
  organizationId: string
  name: string
  description?: string
  ownerId: string
  cadence?: BoardCadence
  periodStart?: Date
  periodEnd?: Date
  createdById: string
  collaboratorIds?: string[]
  automationEnabled?: boolean
}

export interface UpdateBoardData {
  name?: string
  description?: string | null
  status?: BoardStatus
  ownerId?: string
  cadence?: BoardCadence | null
  periodStart?: Date | null
  periodEnd?: Date | null
  collaboratorIds?: string[]
  automationEnabled?: boolean
  skipWeekends?: boolean
}

interface BoardOwner {
  id: string
  name: string | null
  email: string
}

interface BoardCollaboratorWithUser {
  id: string
  userId: string
  role: string
  user: {
    id: string
    name: string | null
    email: string
  }
}

export interface BoardWithCounts extends Board {
  taskInstanceCount: number
  createdBy: BoardOwner
  owner: BoardOwner | null
  collaborators: BoardCollaboratorWithUser[]
}

export class BoardService {
  /**
   * Create a new board
   */
  static async create(data: CreateBoardData): Promise<BoardWithCounts> {
    const board = await prisma.board.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description,
        ownerId: data.ownerId,
        cadence: data.cadence,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        createdById: data.createdById,
        status: "NOT_STARTED",
        automationEnabled: data.automationEnabled ?? false,
        collaborators: data.collaboratorIds?.length ? {
          create: data.collaboratorIds.map(userId => ({
            userId,
            addedBy: data.createdById
          }))
        } : undefined
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        _count: { select: { taskInstances: true } }
      }
    })

    return {
      ...board,
      taskInstanceCount: board._count.taskInstances,
      collaborators: board.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      }))
    }
  }

  /**
   * Get all boards for an organization
   * 
   * @param userId - Current user ID (for access filtering)
   * @param userRole - Current user role (ADMIN sees all, others see owned/collaborated)
   */
  static async getByOrganizationId(
    organizationId: string,
    options?: {
      status?: BoardStatus | BoardStatus[]
      cadence?: BoardCadence | BoardCadence[]
      ownerId?: string
      year?: number
      includeTaskInstanceCount?: boolean
      userId?: string
      userRole?: string
      orgActionPermissions?: OrgActionPermissions
    }
  ): Promise<BoardWithCounts[]> {
    const where: any = { organizationId }

    if (options?.status) {
      where.status = Array.isArray(options.status) ? { in: options.status } : options.status
    }

    if (options?.cadence) {
      where.cadence = Array.isArray(options.cadence) ? { in: options.cadence } : options.cadence
    }

    if (options?.ownerId) {
      where.ownerId = options.ownerId
    }

    if (options?.year) {
      where.periodStart = {
        gte: new Date(options.year, 0, 1),
        lt: new Date(options.year + 1, 0, 1)
      }
    }

    // Apply role-based access filter based on boards:view_all permission
    if (options?.userId && options?.userRole) {
      const canViewAll = canPerformAction(options.userRole, "boards:view_all", options.orgActionPermissions)
      if (!canViewAll) {
        // Non-admins can see boards where they have any access:
        // - Board owner
        // - Board collaborator
        // - Owner of any task in the board
        // - Collaborator on any task in the board
        where.OR = [
          { ownerId: options.userId },
          { collaborators: { some: { userId: options.userId } } },
          { taskInstances: { some: { ownerId: options.userId } } },
          { taskInstances: { some: { collaborators: { some: { userId: options.userId } } } } }
        ]
      }
    }

    const boards = await prisma.board.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        _count: options?.includeTaskInstanceCount ? { select: { taskInstances: true } } : undefined
      },
      orderBy: [
        { status: "asc" },
        { periodStart: "desc" },
        { createdAt: "desc" }
      ]
    })

    return boards.map(board => ({
      ...board,
      taskInstanceCount: (board as any)._count?.taskInstances ?? 0,
      collaborators: board.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      }))
    }))
  }

  /**
   * Get a single board by ID
   */
  static async getById(id: string, organizationId: string): Promise<BoardWithCounts | null> {
    const board = await prisma.board.findFirst({
      where: { id, organizationId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        _count: { select: { taskInstances: true } }
      }
    })

    if (!board) return null

    return {
      ...board,
      taskInstanceCount: board._count.taskInstances,
      collaborators: board.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      }))
    }
  }

  /**
   * Get a single board by ID with its task instances (jobs)
   */
  static async getByIdWithJobs(id: string, organizationId: string): Promise<(BoardWithCounts & { jobs: any[] }) | null> {
    const board = await prisma.board.findFirst({
      where: { id, organizationId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        taskInstances: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
            collaborators: {
              include: { user: { select: { id: true, name: true, email: true } } }
            },
            _count: { 
              select: { 
                requests: { where: { isDraft: false } }, // Active requests only
                collectedItems: true 
              } 
            },
            // Also count draft requests separately
            requests: {
              where: { isDraft: true },
              select: { id: true }
            }
          },
          orderBy: { createdAt: "desc" }
        },
        _count: { select: { taskInstances: true } }
      }
    })

    if (!board) return null

    return {
      ...board,
      taskInstanceCount: board._count.taskInstances,
      collaborators: board.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      })),
      jobs: board.taskInstances.map(ti => ({
        ...ti,
        taskCount: ti._count.requests,
        collectedItemCount: ti._count.collectedItems,
        draftRequestCount: ti.requests.length, // Count of draft requests
        collaborators: ti.collaborators.map(c => ({
          id: c.id,
          userId: c.userId,
          role: c.role,
          user: c.user
        }))
      }))
    }
  }

  /**
   * Update a board
   */
  static async update(
    id: string,
    organizationId: string,
    data: UpdateBoardData,
    updatedById?: string
  ): Promise<BoardWithCounts> {
    const existing = await prisma.board.findFirst({
      where: { id, organizationId }
    })

    if (!existing) throw new Error("Board not found")

    if (data.collaboratorIds !== undefined && updatedById) {
      await prisma.boardCollaborator.deleteMany({ where: { boardId: id } })
      if (data.collaboratorIds.length > 0) {
        await prisma.boardCollaborator.createMany({
          data: data.collaboratorIds.map(userId => ({
            boardId: id,
            userId,
            addedBy: updatedById
          }))
        })
      }
    }

    const board = await prisma.board.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        status: data.status,
        ownerId: data.ownerId,
        cadence: data.cadence,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        automationEnabled: data.automationEnabled,
        skipWeekends: data.skipWeekends
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        _count: { select: { taskInstances: true } }
      }
    })

    // If board is being marked as COMPLETE, trigger snapshotting and next period creation
    if (data.status === "COMPLETE" && existing.status !== "COMPLETE") {
      await this.handleBoardCompletion(id, organizationId, updatedById || board.createdById)
    }

    return {
      ...board,
      taskInstanceCount: board._count.taskInstances,
      collaborators: board.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      }))
    }
  }

  /**
   * Handle board completion: snapshot current instances and auto-create next period
   */
  private static async handleBoardCompletion(boardId: string, organizationId: string, userId: string) {
    // 1. Mark all task instances as snapshots
    await prisma.taskInstance.updateMany({
      where: { boardId, organizationId },
      data: { isSnapshot: true, status: "COMPLETE" }
    })

    // 2. Auto-create next period board if automation enabled
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: { organization: true }
    })

    if (board?.automationEnabled && board.cadence !== "AD_HOC") {
      await this.createNextPeriodBoard(boardId, organizationId, userId)
    }
  }

  /**
   * Create the next period's board
   */
  static async createNextPeriodBoard(
    completedBoardId: string,
    organizationId: string,
    createdById: string
  ): Promise<BoardWithCounts | null> {
    const completedBoard = await prisma.board.findFirst({
      where: { id: completedBoardId, organizationId },
      include: {
        collaborators: true,
        organization: { select: { fiscalYearStartMonth: true, timezone: true } }
      }
    })

    if (!completedBoard || !completedBoard.cadence) return null

    const referenceDate = completedBoard.periodStart || new Date()
    const fiscalYearStartMonth = completedBoard.organization?.fiscalYearStartMonth ?? 1
    const timezone = completedBoard.organization?.timezone
    
    // Warn if timezone not configured - this indicates the org needs to set their timezone
    if (!timezone || timezone === "UTC") {
      console.warn(`[BoardService] Organization ${organizationId} has no timezone configured (using "${timezone || 'none'}"). Board periods may be incorrect.`)
    }
    
    // Use organization timezone, or fall back to UTC only with warning logged above
    const effectiveTimezone = timezone || "UTC"

    const nextPeriodStart = calculateNextPeriodStart(
      completedBoard.cadence,
      referenceDate,
      effectiveTimezone,
      { skipWeekends: completedBoard.skipWeekends, fiscalYearStartMonth }
    )

    if (!nextPeriodStart) return null

    // Idempotency check: verify no board already exists for this period
    const existingBoard = await prisma.board.findFirst({
      where: {
        organizationId,
        cadence: completedBoard.cadence,
        periodStart: nextPeriodStart,
      }
    })

    if (existingBoard) {
      console.log(`[BoardService] Board already exists for period ${nextPeriodStart.toISOString()}: ${existingBoard.name} (${existingBoard.id})`)
      return null
    }

    const nextPeriodEnd = getEndOfPeriod(completedBoard.cadence, nextPeriodStart, effectiveTimezone, { fiscalYearStartMonth })
    const boardName = generatePeriodBoardName(completedBoard.cadence, nextPeriodStart, effectiveTimezone, { fiscalYearStartMonth })

    const newBoard = await prisma.board.create({
      data: {
        organizationId,
        name: boardName,
        description: completedBoard.description,
        ownerId: completedBoard.ownerId || createdById,
        cadence: completedBoard.cadence,
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodEnd,
        createdById,
        status: "NOT_STARTED",
        automationEnabled: completedBoard.automationEnabled,
        skipWeekends: completedBoard.skipWeekends,
        collaborators: completedBoard.collaborators.length > 0 ? {
          create: completedBoard.collaborators.map(c => ({
            userId: c.userId,
            role: c.role,
            addedBy: createdById
          }))
        } : undefined
      }
    })

    // Copy task lineages to the new board
    await this.spawnTaskInstancesForNextPeriod(completedBoardId, newBoard.id, organizationId)

    return this.getById(newBoard.id, organizationId)
  }

  /**
   * Spawn task instances for the next period based on lineages active in the previous period.
   * For REPORTS tasks, generates report output for the completed period and copies config to next period.
   */
  private static async spawnTaskInstancesForNextPeriod(
    previousBoardId: string,
    nextBoardId: string,
    organizationId: string
  ): Promise<void> {
    // Get the previous board for period info
    const previousBoard = await prisma.board.findUnique({
      where: { id: previousBoardId },
    })

    const previousInstances = await prisma.taskInstance.findMany({
      where: { boardId: previousBoardId, organizationId },
      include: {
        collaborators: true,
        taskInstanceLabels: { include: { contactLabels: true } },
      }
    })

    for (const prev of previousInstances) {
      // Create new instance for next period
      const createData: any = {
        organizationId,
        boardId: nextBoardId,
        lineageId: prev.lineageId,
        name: prev.name,
        description: prev.description,
        ownerId: prev.ownerId,
        clientId: prev.clientId,
        status: "NOT_STARTED",
        customFields: prev.customFields,
        labels: prev.labels,
      }
      
      // Carry forward report configuration if task has a report linked
      const prevAnyReport = prev as any
      if (prevAnyReport.reportDefinitionId) {
        createData.reportDefinitionId = prevAnyReport.reportDefinitionId
        createData.reportFilterBindings = prevAnyReport.reportFilterBindings || null
      }
      
      const newInstance = await prisma.taskInstance.create({ data: createData })

      // Copy collaborators
      if (prev.collaborators.length > 0) {
        await prisma.taskInstanceCollaborator.createMany({
          data: prev.collaborators.map(c => ({
            taskInstanceId: newInstance.id,
            userId: c.userId,
            role: c.role,
            addedBy: c.addedBy
          }))
        })
      }

      // Generate report for tasks with a report linked (snapshot the completed period)
      const prevAny = prev as any
      if (prevAny.reportDefinitionId && previousBoard?.periodStart) {
        try {
          // Derive period key from board's period start date
          const periodKey = periodKeyFromDate(previousBoard.periodStart, previousBoard.cadence as any || "monthly")
          
          if (periodKey) {
            await ReportGenerationService.generateForPeriod({
              organizationId,
              reportDefinitionId: prevAny.reportDefinitionId,
              filterBindings: prevAny.reportFilterBindings || undefined,
              taskInstanceId: prev.id,
              boardId: previousBoardId,
              periodKey,
              generatedBy: "system",
            })
            console.log(`[BoardService] Generated report for task ${prev.id}, period ${periodKey}`)
          }
        } catch (error) {
          // Log but don't fail the entire operation if report generation fails
          console.error(`[BoardService] Failed to generate report for task ${prev.id}:`, error)
        }
      }
    }
  }

  /**
   * Sync board status based on the statuses of its task instances
   */
  static async syncStatus(
    boardId: string,
    organizationId: string
  ): Promise<{ board: BoardWithCounts; statusChanged: boolean; previousStatus: string } | null> {
    const board = await prisma.board.findFirst({
      where: { id: boardId, organizationId },
      include: {
        taskInstances: {
          select: { status: true },
          where: {
            status: { not: "ARCHIVED" }
          }
        }
      }
    })

    if (!board) return null
    if (board.status === "ARCHIVED" || board.status === "BLOCKED") return null

    const statuses = board.taskInstances.map(i => i.status)
    if (statuses.length === 0) return null

    const allComplete = statuses.every(s => s === "COMPLETE")
    const anyStarted = statuses.some(s => s !== "NOT_STARTED")

    let targetStatus: BoardStatus = board.status
    
    if (allComplete) {
      targetStatus = "COMPLETE"
    } else if (anyStarted) {
      targetStatus = "IN_PROGRESS"
    } else {
      targetStatus = "NOT_STARTED"
    }

    if (targetStatus === board.status) return null

    const previousStatus = board.status
    const updatedBoard = await this.update(boardId, organizationId, { status: targetStatus })

    return {
      board: updatedBoard,
      statusChanged: true,
      previousStatus
    }
  }

  /**
   * Delete a board and all its task instances
   */
  static async delete(boardId: string, organizationId: string): Promise<boolean> {
    const board = await prisma.board.findFirst({
      where: { id: boardId, organizationId }
    })
    if (!board) return false

    // Delete all task instances first
    await prisma.taskInstance.deleteMany({
      where: { boardId, organizationId }
    })

    // Delete the board
    await prisma.board.delete({
      where: { id: boardId }
    })

    return true
  }

  /**
   * Archive a board by setting its status to CLOSED
   */
  static async archive(boardId: string, organizationId: string): Promise<Board | null> {
    const board = await prisma.board.findFirst({
      where: { id: boardId, organizationId }
    })
    if (!board) return null

    return prisma.board.update({
      where: { id: boardId },
      data: { status: "CLOSED" }
    })
  }

  /**
   * Duplicate a board with all its task instances
   */
  static async duplicate(
    boardId: string,
    organizationId: string,
    newName?: string,
    userId?: string,
    options?: {
      newOwnerId?: string
      newPeriodStart?: Date
      newPeriodEnd?: Date
    }
  ): Promise<Board | null> {
    const board = await prisma.board.findFirst({
      where: { id: boardId, organizationId },
      include: {
        taskInstances: {
          include: {
            collaborators: true
          }
        }
      }
    })
    if (!board) return null

    // Create new board with copied fields
    const newBoard = await prisma.board.create({
      data: {
        organizationId,
        createdById: userId || board.createdById,
        name: newName || `${board.name} (Copy)`,
        description: board.description,
        status: "OPEN",
        cadence: board.cadence,
        periodStart: options?.newPeriodStart || board.periodStart,
        periodEnd: options?.newPeriodEnd || board.periodEnd
      }
    })

    // Copy task instances
    for (const task of board.taskInstances) {
      const newTask = await prisma.taskInstance.create({
        data: {
          organizationId,
          boardId: newBoard.id,
          name: task.name,
          description: task.description,
          status: "NOT_STARTED",
          ownerId: options?.newOwnerId || task.ownerId,
          clientId: task.clientId,
          labels: task.labels as any,
          customFields: task.customFields as any
        }
      })

      // Copy collaborators
      if (task.collaborators.length > 0) {
        await prisma.taskInstanceCollaborator.createMany({
          data: task.collaborators.map(c => ({
            taskInstanceId: newTask.id,
            userId: c.userId,
            role: c.role,
            addedBy: c.addedBy
          }))
        })
      }
    }

    return newBoard
  }
}
