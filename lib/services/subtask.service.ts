import { prisma } from "@/lib/prisma"
import { Subtask, SubtaskStatus } from "@prisma/client"

export interface CreateSubtaskData {
  organizationId: string
  jobId: string
  title: string
  description?: string
  ownerId?: string
  status?: SubtaskStatus
  dueDate?: Date
}

export interface UpdateSubtaskData {
  title?: string
  description?: string | null
  ownerId?: string | null
  status?: SubtaskStatus
  dueDate?: Date | null
  sortOrder?: number
}

export interface SubtaskWithRelations extends Subtask {
  owner: {
    id: string
    name: string | null
    email: string
  } | null
  attachmentCount: number
}

export class SubtaskService {
  /**
   * Create a new subtask
   */
  static async create(data: CreateSubtaskData): Promise<SubtaskWithRelations> {
    // Get the next sort order for this job
    const maxSortOrder = await prisma.subtask.aggregate({
      where: { jobId: data.jobId },
      _max: { sortOrder: true }
    })
    const nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1

    const subtask = await prisma.subtask.create({
      data: {
        organizationId: data.organizationId,
        jobId: data.jobId,
        title: data.title,
        description: data.description,
        ownerId: data.ownerId,
        status: data.status || "NOT_STARTED",
        dueDate: data.dueDate,
        sortOrder: nextSortOrder
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: { attachments: true }
        }
      }
    })

    return {
      ...subtask,
      owner: subtask.owner,
      attachmentCount: subtask._count.attachments
    }
  }

  /**
   * Get all subtasks for a job
   */
  static async getByJobId(
    jobId: string,
    organizationId: string
  ): Promise<SubtaskWithRelations[]> {
    const subtasks = await prisma.subtask.findMany({
      where: { jobId, organizationId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: { attachments: true }
        }
      },
      orderBy: { sortOrder: "asc" }
    })

    return subtasks.map(subtask => ({
      ...subtask,
      owner: subtask.owner,
      attachmentCount: subtask._count.attachments
    }))
  }

  /**
   * Get a single subtask by ID
   */
  static async getById(
    id: string,
    organizationId: string
  ): Promise<SubtaskWithRelations | null> {
    const subtask = await prisma.subtask.findFirst({
      where: { id, organizationId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: { attachments: true }
        }
      }
    })

    if (!subtask) return null

    return {
      ...subtask,
      owner: subtask.owner,
      attachmentCount: subtask._count.attachments
    }
  }

  /**
   * Update a subtask
   */
  static async update(
    id: string,
    organizationId: string,
    data: UpdateSubtaskData
  ): Promise<SubtaskWithRelations> {
    // Verify subtask exists and belongs to organization
    const existing = await prisma.subtask.findFirst({
      where: { id, organizationId }
    })

    if (!existing) {
      throw new Error("Subtask not found")
    }

    // If status is changing to DONE, set completedAt
    let completedAt: Date | null | undefined = undefined
    if (data.status === "DONE" && existing.status !== "DONE") {
      completedAt = new Date()
    } else if (data.status && data.status !== "DONE" && existing.status === "DONE") {
      completedAt = null // Clear completedAt if moving away from DONE
    }

    const subtask = await prisma.subtask.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        ownerId: data.ownerId,
        status: data.status,
        dueDate: data.dueDate,
        sortOrder: data.sortOrder,
        completedAt
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        _count: {
          select: { attachments: true }
        }
      }
    })

    return {
      ...subtask,
      owner: subtask.owner,
      attachmentCount: subtask._count.attachments
    }
  }

  /**
   * Delete a subtask
   */
  static async delete(id: string, organizationId: string): Promise<void> {
    const subtask = await prisma.subtask.findFirst({
      where: { id, organizationId }
    })

    if (!subtask) {
      throw new Error("Subtask not found")
    }

    // Attachments will be cascade deleted
    await prisma.subtask.delete({
      where: { id }
    })
  }

  /**
   * Reorder subtasks within a job
   */
  static async reorder(
    jobId: string,
    organizationId: string,
    subtaskIds: string[]
  ): Promise<void> {
    // Verify all subtasks belong to the job
    const subtasks = await prisma.subtask.findMany({
      where: { jobId, organizationId },
      select: { id: true }
    })

    const existingIds = new Set(subtasks.map(s => s.id))
    const allValid = subtaskIds.every(id => existingIds.has(id))

    if (!allValid) {
      throw new Error("Invalid subtask IDs for reordering")
    }

    // Update sort orders in a transaction
    await prisma.$transaction(
      subtaskIds.map((id, index) =>
        prisma.subtask.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    )
  }

  /**
   * Toggle subtask completion (quick action)
   */
  static async toggleComplete(
    id: string,
    organizationId: string
  ): Promise<SubtaskWithRelations> {
    const existing = await prisma.subtask.findFirst({
      where: { id, organizationId }
    })

    if (!existing) {
      throw new Error("Subtask not found")
    }

    const newStatus: SubtaskStatus = existing.status === "DONE" ? "NOT_STARTED" : "DONE"
    
    return this.update(id, organizationId, { status: newStatus })
  }

  /**
   * Get subtask counts by status for a job
   */
  static async getStatusCounts(
    jobId: string,
    organizationId: string
  ): Promise<Record<SubtaskStatus, number>> {
    const counts = await prisma.subtask.groupBy({
      by: ["status"],
      where: { jobId, organizationId },
      _count: { id: true }
    })

    const result: Record<SubtaskStatus, number> = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      STUCK: 0,
      DONE: 0
    }

    for (const count of counts) {
      result[count.status] = count._count.id
    }

    return result
  }
}
