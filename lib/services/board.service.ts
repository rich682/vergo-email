import { prisma } from "@/lib/prisma"
import { Board, BoardStatus, BoardCadence } from "@prisma/client"

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
        periodEnd: data.periodEnd
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
}
