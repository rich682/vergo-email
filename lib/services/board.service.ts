import { prisma } from "@/lib/prisma"
import { Board, BoardStatus, BoardCadence, JobStatus, TaskType } from "@prisma/client"
import { startOfWeek, endOfWeek, endOfMonth, endOfQuarter, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, format, isWeekend, nextMonday } from "date-fns"
import { TaskInstanceService } from "./task-instance.service"

/**
 * Derive periodEnd from periodStart based on cadence type.
 */
export function derivePeriodEnd(
  cadence: BoardCadence | null | undefined,
  periodStart: Date | null | undefined
): Date | null {
  if (!cadence || !periodStart) return null
  
  switch (cadence) {
    case "DAILY":
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
    case "WEEKLY":
      return endOfWeek(periodStart, { weekStartsOn: 1 })
    case "MONTHLY":
      return endOfMonth(periodStart)
    case "QUARTERLY":
      return endOfQuarter(periodStart)
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
 */
export function normalizePeriodStart(
  cadence: BoardCadence | null | undefined,
  periodStart: Date | null | undefined
): Date | null {
  if (!cadence || !periodStart) return null
  
  switch (cadence) {
    case "DAILY":
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
    case "WEEKLY":
      return startOfWeek(periodStart, { weekStartsOn: 1 })
    case "MONTHLY":
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
    case "QUARTERLY":
      const quarterMonth = Math.floor(periodStart.getMonth() / 3) * 3
      return new Date(periodStart.getFullYear(), quarterMonth, 1)
    case "YEAR_END":
      return new Date(periodStart.getFullYear(), 0, 1)
    case "AD_HOC":
      return null
    default:
      return null
  }
}

/**
 * Calculate the next period start date based on cadence.
 */
export function calculateNextPeriodStart(
  cadence: BoardCadence | null | undefined,
  currentPeriodStart: Date | null | undefined,
  options?: {
    skipWeekends?: boolean
    fiscalYearStartMonth?: number // 1-12
  }
): Date | null {
  if (!cadence || !currentPeriodStart || cadence === "AD_HOC") return null

  const skipWeekends = options?.skipWeekends ?? true
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY": {
      let nextDate = addDays(currentPeriodStart, 1)
      if (skipWeekends && isWeekend(nextDate)) {
        nextDate = nextMonday(nextDate)
      }
      return nextDate
    }
    case "WEEKLY":
      return addWeeks(startOfWeek(currentPeriodStart, { weekStartsOn: 1 }), 1)
    case "MONTHLY":
      return addMonths(new Date(currentPeriodStart.getFullYear(), currentPeriodStart.getMonth(), 1), 1)
    case "QUARTERLY": {
      const quarterMonth = Math.floor(currentPeriodStart.getMonth() / 3) * 3
      const currentQuarterStart = new Date(currentPeriodStart.getFullYear(), quarterMonth, 1)
      return addMonths(currentQuarterStart, 3)
    }
    case "YEAR_END": {
      const currentYear = currentPeriodStart.getFullYear()
      if (fiscalYearStartMonth === 1) {
        return new Date(currentYear + 1, 0, 1)
      }
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      if (currentPeriodStart.getMonth() >= fiscalMonthIndex) {
        return new Date(currentYear + 1, fiscalMonthIndex, 1)
      } else {
        return new Date(currentYear, fiscalMonthIndex, 1)
      }
    }
    default:
      return null
  }
}

/**
 * Generate a board name for a given period.
 */
export function generatePeriodBoardName(
  cadence: BoardCadence,
  periodStart: Date,
  options?: {
    fiscalYearStartMonth?: number
  }
): string {
  const fiscalYearStartMonth = options?.fiscalYearStartMonth ?? 1

  switch (cadence) {
    case "DAILY":
      return format(periodStart, "MMM d, yyyy")
    case "WEEKLY":
      return `Week of ${format(periodStart, "MMM d, yyyy")}`
    case "MONTHLY":
      return format(periodStart, "MMMM yyyy")
    case "QUARTERLY": {
      const quarterIndex = Math.floor(periodStart.getMonth() / 3)
      let fiscalQuarter = quarterIndex + 1
      if (fiscalYearStartMonth !== 1) {
        const fiscalMonthIndex = fiscalYearStartMonth - 1
        const monthsFromFiscalStart = (periodStart.getMonth() - fiscalMonthIndex + 12) % 12
        fiscalQuarter = Math.floor(monthsFromFiscalStart / 3) + 1
      }
      return `Q${fiscalQuarter} ${periodStart.getFullYear()}`
    }
    case "YEAR_END":
      return `Year-End ${periodStart.getFullYear()}`
    case "AD_HOC":
      return "Ad Hoc Board"
    default:
      return "New Board"
  }
}

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
   */
  static async getByOrganizationId(
    organizationId: string,
    options?: {
      status?: BoardStatus | BoardStatus[]
      cadence?: BoardCadence | BoardCadence[]
      ownerId?: string
      year?: number
      includeTaskInstanceCount?: boolean
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
            _count: { select: { requests: true } }
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
        organization: { select: { fiscalYearStartMonth: true } }
      }
    })

    if (!completedBoard || !completedBoard.cadence) return null

    const referenceDate = completedBoard.periodStart || new Date()
    const fiscalYearStartMonth = completedBoard.organization?.fiscalYearStartMonth ?? 1

    const nextPeriodStart = calculateNextPeriodStart(
      completedBoard.cadence,
      referenceDate,
      { skipWeekends: completedBoard.skipWeekends, fiscalYearStartMonth }
    )

    if (!nextPeriodStart) return null

    const nextPeriodEnd = derivePeriodEnd(completedBoard.cadence, nextPeriodStart)
    const boardName = generatePeriodBoardName(completedBoard.cadence, nextPeriodStart, { fiscalYearStartMonth })

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
   * Spawn task instances for the next period based on lineages active in the previous period
   */
  private static async spawnTaskInstancesForNextPeriod(
    previousBoardId: string,
    nextBoardId: string,
    organizationId: string
  ): Promise<void> {
    const previousInstances = await prisma.taskInstance.findMany({
      where: { boardId: previousBoardId, organizationId },
      include: {
        collaborators: true,
        taskInstanceLabels: { include: { contactLabels: true } }
      }
    })

    for (const prev of previousInstances) {
      // Create new instance
      const newInstance = await prisma.taskInstance.create({
        data: {
          organizationId,
          boardId: nextBoardId,
          lineageId: prev.lineageId,
          type: prev.type,
          name: prev.name,
          description: prev.description,
          ownerId: prev.ownerId,
          clientId: prev.clientId,
          status: "NOT_STARTED",
          // Carry forward structured data for TABLE tasks as beginning balance
          structuredData: prev.type === TaskType.TABLE ? prev.structuredData : null,
          customFields: prev.customFields,
          labels: prev.labels as any
        }
      })

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
}
