import { prisma } from "@/lib/prisma"
import { Board, BoardStatus, BoardCadence } from "@prisma/client"
import { startOfWeek, endOfWeek, endOfMonth, endOfQuarter, endOfYear, addDays, addWeeks, addMonths, addQuarters, addYears, format, isWeekend, nextMonday } from "date-fns"

/**
 * Derive periodEnd from periodStart based on cadence type.
 * This ensures consistent period calculations server-side.
 * 
 * Rules:
 * - DAILY: periodEnd = periodStart (same day)
 * - WEEKLY: periodEnd = Sunday of the week (ISO week, Monday start)
 * - MONTHLY: periodEnd = last day of the month
 * - QUARTERLY: periodEnd = last day of the quarter
 * - YEAR_END: periodEnd = Dec 31 of the year
 * - AD_HOC: periodEnd = null
 */
export function derivePeriodEnd(
  cadence: BoardCadence | null | undefined,
  periodStart: Date | null | undefined
): Date | null {
  if (!cadence || !periodStart) return null
  
  switch (cadence) {
    case "DAILY":
      // Same day
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
    
    case "WEEKLY":
      // Sunday of the week (ISO week: Monday = start)
      return endOfWeek(periodStart, { weekStartsOn: 1 })
    
    case "MONTHLY":
      // Last day of the month
      return endOfMonth(periodStart)
    
    case "QUARTERLY":
      // Last day of the quarter
      return endOfQuarter(periodStart)
    
    case "YEAR_END":
      // December 31 of the year
      return endOfYear(periodStart)
    
    case "AD_HOC":
      return null
    
    default:
      return null
  }
}

/**
 * Normalize periodStart based on cadence type.
 * Ensures periodStart is set to the correct start of the period.
 * 
 * Rules:
 * - DAILY: periodStart = the specific date (unchanged)
 * - WEEKLY: periodStart = Monday of the week
 * - MONTHLY: periodStart = 1st of the month
 * - QUARTERLY: periodStart = 1st of the quarter
 * - YEAR_END: periodStart = Jan 1 of the year
 * - AD_HOC: periodStart = null
 */
export function normalizePeriodStart(
  cadence: BoardCadence | null | undefined,
  periodStart: Date | null | undefined
): Date | null {
  if (!cadence || !periodStart) return null
  
  switch (cadence) {
    case "DAILY":
      // Keep the specific date
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
    
    case "WEEKLY":
      // Monday of the week (ISO week: Monday = start)
      return startOfWeek(periodStart, { weekStartsOn: 1 })
    
    case "MONTHLY":
      // First day of the month
      return new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
    
    case "QUARTERLY":
      // First day of the quarter
      const quarterMonth = Math.floor(periodStart.getMonth() / 3) * 3
      return new Date(periodStart.getFullYear(), quarterMonth, 1)
    
    case "YEAR_END":
      // January 1 of the year
      return new Date(periodStart.getFullYear(), 0, 1)
    
    case "AD_HOC":
      return null
    
    default:
      return null
  }
}

/**
 * Calculate the next period start date based on cadence.
 * 
 * Rules:
 * - DAILY: next day (or next Monday if skipWeekends and result is weekend)
 * - WEEKLY: Monday of next week
 * - MONTHLY: 1st of next month
 * - QUARTERLY: 1st of next quarter
 * - YEAR_END: Jan 1 of next year (or fiscal year start if provided)
 * - AD_HOC: null (no next period)
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
      // Skip weekends if configured
      if (skipWeekends && isWeekend(nextDate)) {
        nextDate = nextMonday(nextDate)
      }
      return nextDate
    }

    case "WEEKLY":
      // Monday of next week
      return addWeeks(startOfWeek(currentPeriodStart, { weekStartsOn: 1 }), 1)

    case "MONTHLY":
      // 1st of next month
      return addMonths(new Date(currentPeriodStart.getFullYear(), currentPeriodStart.getMonth(), 1), 1)

    case "QUARTERLY": {
      // 1st of next quarter
      const quarterMonth = Math.floor(currentPeriodStart.getMonth() / 3) * 3
      const currentQuarterStart = new Date(currentPeriodStart.getFullYear(), quarterMonth, 1)
      return addMonths(currentQuarterStart, 3)
    }

    case "YEAR_END": {
      // Start of next fiscal year
      const currentYear = currentPeriodStart.getFullYear()
      // If fiscal year starts in January, just go to next calendar year
      if (fiscalYearStartMonth === 1) {
        return new Date(currentYear + 1, 0, 1)
      }
      // Otherwise, calculate next fiscal year start
      const fiscalMonthIndex = fiscalYearStartMonth - 1
      if (currentPeriodStart.getMonth() >= fiscalMonthIndex) {
        // Current period is in or after fiscal year start month, go to next year
        return new Date(currentYear + 1, fiscalMonthIndex, 1)
      } else {
        // Current period is before fiscal year start month (same calendar year)
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
      // Adjust quarter number based on fiscal year
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
  ownerId: string           // Required: accountable user
  cadence?: BoardCadence    // Type of time period
  periodStart?: Date
  periodEnd?: Date
  createdById: string
  collaboratorIds?: string[] // Optional: team members to add
  automationEnabled?: boolean // Auto-create next board when complete
}

export interface UpdateBoardData {
  name?: string
  description?: string | null
  status?: BoardStatus
  ownerId?: string
  cadence?: BoardCadence | null
  periodStart?: Date | null
  periodEnd?: Date | null
  collaboratorIds?: string[] // Replace all collaborators
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
  jobCount: number
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
        // Add collaborators if provided
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
        _count: { select: { jobs: true } }
      }
    })

    return {
      ...board,
      jobCount: board._count.jobs,
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
      year?: number // Filter by periodStart year
      includeJobCount?: boolean
    }
  ): Promise<BoardWithCounts[]> {
    const where: any = { organizationId }

    if (options?.status) {
      where.status = Array.isArray(options.status)
        ? { in: options.status }
        : options.status
    }

    if (options?.cadence) {
      where.cadence = Array.isArray(options.cadence)
        ? { in: options.cadence }
        : options.cadence
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
        _count: options?.includeJobCount
          ? { select: { jobs: true } }
          : undefined
      },
      orderBy: [
        { status: "asc" },
        { periodStart: "desc" },
        { createdAt: "desc" }
      ]
    })

    return boards.map(board => ({
      ...board,
      jobCount: (board as any)._count?.jobs ?? 0,
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
  static async getById(
    id: string,
    organizationId: string
  ): Promise<BoardWithCounts | null> {
    const board = await prisma.board.findFirst({
      where: { id, organizationId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        _count: { select: { jobs: true } }
      }
    })

    if (!board) return null

    return {
      ...board,
      jobCount: board._count.jobs,
      collaborators: board.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      }))
    }
  }

  /**
   * Get a board with its jobs
   */
  static async getByIdWithJobs(
    id: string,
    organizationId: string
  ): Promise<(BoardWithCounts & { jobs: any[] }) | null> {
    const board = await prisma.board.findFirst({
      where: { id, organizationId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        jobs: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
            _count: { select: { tasks: true, subtasks: true } }
          },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "desc" }
          ]
        }
      }
    })

    if (!board) return null

    return {
      ...board,
      jobCount: board.jobs.length,
      collaborators: board.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
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
    // Verify board exists and belongs to organization
    const existing = await prisma.board.findFirst({
      where: { id, organizationId }
    })

    if (!existing) {
      throw new Error("Board not found")
    }

    // Handle collaborator updates separately if provided
    if (data.collaboratorIds !== undefined && updatedById) {
      // Delete existing collaborators
      await prisma.boardCollaborator.deleteMany({
        where: { boardId: id }
      })
      
      // Add new collaborators
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
        _count: { select: { jobs: true } }
      }
    })

    return {
      ...board,
      jobCount: board._count.jobs,
      collaborators: board.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      }))
    }
  }

  /**
   * Archive a board (soft delete)
   */
  static async archive(id: string, organizationId: string): Promise<BoardWithCounts> {
    return this.update(id, organizationId, { status: "ARCHIVED" })
  }

  /**
   * Sync board status based on the statuses of its tasks (jobs).
   * 
   * Rules:
   * - If board has no jobs → status unchanged
   * - If all jobs are NOT_STARTED → Board stays NOT_STARTED
   * - If any job is not NOT_STARTED (and not all complete) → Board becomes IN_PROGRESS
   * - If all jobs are COMPLETE → Board becomes COMPLETE
   * 
   * This should be called after job status changes.
   * 
   * @returns The new board status if changed, null if no change needed
   */
  static async syncBoardStatusFromJobs(
    boardId: string,
    organizationId: string
  ): Promise<{ board: BoardWithCounts; statusChanged: boolean; previousStatus: string } | null> {
    // Get the board with its jobs
    const board = await prisma.board.findFirst({
      where: { id: boardId, organizationId },
      include: {
        jobs: {
          select: { status: true },
          where: {
            status: { not: "ARCHIVED" } // Don't count archived jobs
          }
        }
      }
    })

    if (!board) return null

    // Don't change status of archived or blocked boards
    if (board.status === "ARCHIVED" || board.status === "BLOCKED") {
      return null
    }

    const jobStatuses = board.jobs.map(j => j.status)
    
    // If no jobs, don't change status
    if (jobStatuses.length === 0) {
      return null
    }

    // Determine target status based on job statuses
    // Job statuses that indicate "started": ACTIVE, IN_PROGRESS, COMPLETE, FULFILLED
    const startedStatuses = ["ACTIVE", "IN_PROGRESS", "COMPLETE", "FULFILLED"]
    const completeStatuses = ["COMPLETE", "FULFILLED"]
    
    const allNotStarted = jobStatuses.every(s => s === "NOT_STARTED")
    const allComplete = jobStatuses.every(s => completeStatuses.includes(s))
    const anyStarted = jobStatuses.some(s => startedStatuses.includes(s))

    let targetStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" = board.status as any
    
    if (allComplete) {
      targetStatus = "COMPLETE"
    } else if (anyStarted || !allNotStarted) {
      targetStatus = "IN_PROGRESS"
    } else {
      targetStatus = "NOT_STARTED"
    }

    // Only update if status actually changes
    if (targetStatus === board.status) {
      return null
    }

    const previousStatus = board.status
    const updatedBoard = await this.update(boardId, organizationId, { status: targetStatus })

    return {
      board: updatedBoard,
      statusChanged: true,
      previousStatus
    }
  }

  /**
   * Delete a board (hard delete - only if no jobs)
   */
  static async delete(id: string, organizationId: string): Promise<void> {
    const board = await prisma.board.findFirst({
      where: { id, organizationId },
      include: {
        _count: { select: { jobs: true } }
      }
    })

    if (!board) {
      throw new Error("Board not found")
    }

    if (board._count.jobs > 0) {
      throw new Error("Cannot delete board with jobs. Archive it instead or move jobs first.")
    }

    await prisma.board.delete({
      where: { id }
    })
  }

  /**
   * Check if user can access board
   */
  static async canAccess(
    boardId: string,
    organizationId: string
  ): Promise<boolean> {
    const board = await prisma.board.findFirst({
      where: { id: boardId, organizationId }
    })
    return !!board
  }

  /**
   * Duplicate a board with all its jobs and subtasks
   */
  static async duplicate(
    sourceBoardId: string,
    organizationId: string,
    newName: string,
    createdById: string,
    options?: {
      newOwnerId?: string
      newPeriodStart?: Date
      newPeriodEnd?: Date
    }
  ): Promise<BoardWithCounts> {
    // Get the source board with all jobs, subtasks, and collaborators
    const sourceBoard = await prisma.board.findFirst({
      where: { id: sourceBoardId, organizationId },
      include: {
        collaborators: true,
        jobs: {
          include: {
            subtasks: true
          }
        }
      }
    })

    if (!sourceBoard) {
      throw new Error("Source board not found")
    }

    // Create the new board
    const newBoard = await prisma.board.create({
      data: {
        organizationId,
        name: newName,
        description: sourceBoard.description,
        ownerId: options?.newOwnerId || sourceBoard.ownerId || createdById,
        cadence: sourceBoard.cadence,
        periodStart: options?.newPeriodStart || sourceBoard.periodStart,
        periodEnd: options?.newPeriodEnd || sourceBoard.periodEnd,
        createdById,
        status: "NOT_STARTED",
        // Copy collaborators from source board
        collaborators: sourceBoard.collaborators.length > 0 ? {
          create: sourceBoard.collaborators.map(c => ({
            userId: c.userId,
            role: c.role,
            addedBy: createdById
          }))
        } : undefined
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        _count: { select: { jobs: true } }
      }
    })

    // Duplicate all jobs
    for (const job of sourceBoard.jobs) {
      const newJob = await prisma.job.create({
        data: {
          organizationId,
          boardId: newBoard.id,
          name: job.name,
          description: job.description,
          ownerId: job.ownerId,
          status: "NOT_STARTED", // Reset status for new board
          dueDate: job.dueDate,
          labels: job.labels as any,
          sortOrder: job.sortOrder
        }
      })

      // Duplicate subtasks for this job
      for (const subtask of job.subtasks) {
        await prisma.subtask.create({
          data: {
            organizationId,
            jobId: newJob.id,
            title: subtask.title,
            description: subtask.description,
            ownerId: subtask.ownerId,
            status: "NOT_STARTED", // Reset status
            dueDate: subtask.dueDate,
            sortOrder: subtask.sortOrder
          }
        })
      }
    }

    return {
      ...newBoard,
      jobCount: newBoard._count.jobs,
      collaborators: newBoard.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      }))
    }
  }

  /**
   * Create the next period's board when a board is marked complete.
   * Only creates if automationEnabled is true and cadence is not AD_HOC.
   * 
   * @param completedBoardId - ID of the board that was just completed
   * @param organizationId - Organization ID for scoping
   * @param createdById - User ID who triggered the completion
   * @returns The new board if created, null if automation is disabled or not applicable
   */
  static async createNextPeriodBoard(
    completedBoardId: string,
    organizationId: string,
    createdById: string
  ): Promise<BoardWithCounts | null> {
    // Fetch the completed board with collaborators
    const completedBoard = await prisma.board.findFirst({
      where: { id: completedBoardId, organizationId },
      include: {
        collaborators: true,
        organization: {
          select: { fiscalYearStartMonth: true }
        }
      }
    })

    if (!completedBoard) {
      throw new Error("Board not found")
    }

    // Check if automation should run
    if (!completedBoard.automationEnabled) {
      return null // Automation is disabled for this board
    }

    if (completedBoard.cadence === "AD_HOC" || !completedBoard.cadence) {
      return null // AD_HOC boards never auto-create
    }

    // Calculate next period start
    // If no periodStart exists, use today as the reference
    const referenceDate = completedBoard.periodStart || new Date()
    const fiscalYearStartMonth = completedBoard.organization?.fiscalYearStartMonth ?? 1

    const nextPeriodStart = calculateNextPeriodStart(
      completedBoard.cadence,
      referenceDate,
      {
        skipWeekends: completedBoard.skipWeekends,
        fiscalYearStartMonth
      }
    )

    if (!nextPeriodStart) {
      return null // Could not calculate next period
    }

    // Derive period end
    const nextPeriodEnd = derivePeriodEnd(completedBoard.cadence, nextPeriodStart)

    // Generate board name
    const boardName = generatePeriodBoardName(
      completedBoard.cadence,
      nextPeriodStart,
      { fiscalYearStartMonth }
    )

    // Create the new board
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
        // Copy collaborators from completed board
        collaborators: completedBoard.collaborators.length > 0 ? {
          create: completedBoard.collaborators.map(c => ({
            userId: c.userId,
            role: c.role,
            addedBy: createdById
          }))
        } : undefined
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        _count: { select: { jobs: true } }
      }
    })

    // Copy tasks from the completed board to the new board
    await this.copyTasksToBoard(completedBoardId, newBoard.id, organizationId, createdById)

    // Re-fetch to get updated job count
    const updatedBoard = await prisma.board.findUnique({
      where: { id: newBoard.id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        _count: { select: { jobs: true } }
      }
    })

    if (!updatedBoard) {
      throw new Error("Failed to fetch updated board")
    }

    return {
      ...updatedBoard,
      jobCount: updatedBoard._count.jobs,
      collaborators: updatedBoard.collaborators.map(c => ({
        id: c.id,
        userId: c.userId,
        role: c.role,
        user: c.user
      }))
    }
  }

  /**
   * Copy all tasks (jobs) from one board to another.
   * Copies task name, description, owner, and stakeholders.
   * Does NOT copy: requests, replies, attachments, comments, status (resets to NOT_STARTED).
   */
  private static async copyTasksToBoard(
    sourceBoardId: string,
    targetBoardId: string,
    organizationId: string,
    createdById: string
  ): Promise<void> {
    // Fetch all jobs from source board with their stakeholders and collaborators
    const sourceJobs = await prisma.job.findMany({
      where: {
        boardId: sourceBoardId,
        organizationId,
        status: { not: "ARCHIVED" } // Don't copy archived tasks
      },
      include: {
        stakeholders: true,
        collaborators: true
      }
    })

    // Create each job in the target board
    for (const sourceJob of sourceJobs) {
      await prisma.job.create({
        data: {
          organizationId,
          boardId: targetBoardId,
          name: sourceJob.name,
          description: sourceJob.description,
          ownerId: sourceJob.ownerId,
          status: "NOT_STARTED", // Always start fresh
          // Copy due date pattern (if source had one, shift to new period)
          // For now, we'll leave dueDate null - users can set when needed
          labels: sourceJob.labels,
          notes: sourceJob.notes,
          customFields: sourceJob.customFields,
          createdById,
          // Copy stakeholders
          stakeholders: sourceJob.stakeholders.length > 0 ? {
            create: sourceJob.stakeholders.map(s => ({
              type: s.type,
              contactId: s.contactId,
              contactTypeId: s.contactTypeId,
              groupId: s.groupId
            }))
          } : undefined,
          // Copy collaborators
          collaborators: sourceJob.collaborators.length > 0 ? {
            create: sourceJob.collaborators.map(c => ({
              userId: c.userId,
              addedBy: createdById
            }))
          } : undefined
        }
      })
    }
  }
}
