import { prisma } from "@/lib/prisma"
import { Board, BoardStatus } from "@prisma/client"

export interface CreateBoardData {
  organizationId: string
  name: string
  description?: string
  periodStart?: Date
  periodEnd?: Date
  createdById: string
}

export interface UpdateBoardData {
  name?: string
  description?: string | null
  status?: BoardStatus
  periodStart?: Date | null
  periodEnd?: Date | null
}

export interface BoardWithCounts extends Board {
  jobCount: number
  createdBy: {
    id: string
    name: string | null
    email: string
  }
}

export class BoardService {
  /**
   * Create a new board
   */
  static async create(data: CreateBoardData): Promise<Board> {
    return prisma.board.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        description: data.description,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        createdById: data.createdById,
        status: "OPEN"
      }
    })
  }

  /**
   * Get all boards for an organization
   */
  static async getByOrganizationId(
    organizationId: string,
    options?: {
      status?: BoardStatus | BoardStatus[]
      includeJobCount?: boolean
    }
  ): Promise<BoardWithCounts[]> {
    const where: any = { organizationId }

    if (options?.status) {
      where.status = Array.isArray(options.status)
        ? { in: options.status }
        : options.status
    }

    const boards = await prisma.board.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: options?.includeJobCount
          ? { select: { jobs: true } }
          : undefined
      },
      orderBy: [
        { status: "asc" }, // OPEN first, then CLOSED, then ARCHIVED
        { createdAt: "desc" }
      ]
    })

    return boards.map(board => ({
      ...board,
      jobCount: (board as any)._count?.jobs ?? 0,
      createdBy: board.createdBy
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
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: { jobs: true }
        }
      }
    })

    if (!board) return null

    return {
      ...board,
      jobCount: board._count.jobs,
      createdBy: board.createdBy
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
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        jobs: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            _count: {
              select: {
                tasks: true,
                subtasks: true
              }
            }
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
      createdBy: board.createdBy
    }
  }

  /**
   * Update a board
   */
  static async update(
    id: string,
    organizationId: string,
    data: UpdateBoardData
  ): Promise<Board> {
    // Verify board exists and belongs to organization
    const existing = await prisma.board.findFirst({
      where: { id, organizationId }
    })

    if (!existing) {
      throw new Error("Board not found")
    }

    return prisma.board.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        status: data.status,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd
      }
    })
  }

  /**
   * Archive a board (soft delete)
   */
  static async archive(id: string, organizationId: string): Promise<Board> {
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
}
