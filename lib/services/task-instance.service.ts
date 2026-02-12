/**
 * TaskInstance Service
 * 
 * Manages TaskInstance lifecycle - the persistent work container that owns Requests.
 * TaskInstances enable period-centric workflows where:
 * - A TaskInstance represents a specific accounting obligation for a period (e.g., "Jan 2026 Bank Rec")
 * - TaskInstances are spawned from TaskLineages
 * - Requests (threaded communication) are actions taken within a TaskInstance
 * 
 * Ownership Model:
 * - Each TaskInstance has a single owner (ownerId) who is accountable
 * - Collaborators can view, execute requests, and add comments
 * - Only the owner, collaborators, and ADMINs can access a TaskInstance
 * - MEMBERs cannot view tasks they don't own or collaborate on
 */

import { prisma } from "@/lib/prisma"
import { JobStatus, TaskStatus, UserRole } from "@prisma/client"
import { canPerformAction, type OrgActionPermissions } from "@/lib/permissions"

export interface TaskInstanceStakeholder {
  type: "contact_type" | "group" | "individual"
  id: string
  name: string
}

export interface TaskInstanceLabels {
  tags?: string[]
  period?: string
  workType?: string
  stakeholders?: TaskInstanceStakeholder[]
}

export interface CreateTaskInstanceInput {
  organizationId: string
  lineageId?: string
  ownerId: string  // Required: accountable user
  name: string
  description?: string
  clientId?: string
  boardId?: string  // Optional: parent board for period-based organization
  dueDate?: Date
  labels?: TaskInstanceLabels
  tags?: string[]
}

export interface UpdateTaskInstanceInput {
  name?: string
  description?: string
  clientId?: string | null
  ownerId?: string  // Can transfer ownership
  boardId?: string | null  // Can move between boards
  sortOrder?: number  // Order within board
  status?: JobStatus
  dueDate?: Date | null
  labels?: TaskInstanceLabels
  tags?: string[]
  notes?: string | null
  customFields?: Record<string, any>
  structuredData?: any
  isSnapshot?: boolean
  lineageId?: string | null  // For linking to lineage
  // Report configuration
  reportDefinitionId?: string | null
  /** @deprecated Filters now live on ReportDefinition.filterBindings */
  reportFilterBindings?: Record<string, string[]> | null
  // Reconciliation configuration
  reconciliationConfigId?: string | null
}

export interface TaskInstanceOwner {
  id: string
  name: string | null
  email: string
}

export interface TaskInstanceCollaborator {
  id: string
  userId: string
  role: string
  addedAt: Date
  addedBy: string
  user: {
    id: string
    name: string | null
    email: string
  }
}

export interface TaskInstanceWithStats {
  id: string
  organizationId: string
  lineageId: string | null
  ownerId: string
  name: string
  description: string | null
  clientId: string | null
  boardId: string | null
  board?: {
    id: string
    name: string
    cadence?: string | null
    periodStart?: Date | null
    periodEnd?: Date | null
  } | null
  status: JobStatus
  dueDate: Date | null
  labels: TaskInstanceLabels | null
  notes?: string | null
  customFields?: Record<string, any> | null
  structuredData?: any
  isSnapshot: boolean
  // Report configuration (for REPORTS type)
  reportDefinitionId?: string | null
  reportFilterBindings?: Record<string, string[]> | null
  createdAt: Date
  updatedAt: Date
  owner: TaskInstanceOwner
  collaborators?: TaskInstanceCollaborator[]
  client?: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
  } | null
  // Computed stats
  requestCount: number
  respondedCount: number
  completedCount: number
  stakeholderCount?: number
  collectedItemCount?: number
  generatedReportCount?: number
  reconciliationRunCount?: number
}

// Permission actions for TaskInstances
export type TaskInstanceAction =
  | 'view'
  | 'edit'
  | 'update_status'
  | 'add_request'
  | 'execute_request'
  | 'archive'
  | 'manage_collaborators'
  | 'add_comment'

export class TaskInstanceService {
  /**
   * Check if a user can perform an action on a task instance
   *
   * ADMIN/MANAGER: Full access
   * Owner: Full access
   * Task Collaborator: Can view, update status, execute requests, add comments
   * Board Collaborator: Same as task collaborator (sees all tasks in their boards)
   */
  static async canUserAccess(
    userId: string,
    userRole: UserRole,
    taskInstance: { id: string; ownerId: string; boardId?: string | null },
    action: TaskInstanceAction
  ): Promise<boolean> {
    // ADMIN and MANAGER have full access to all tasks
    if (userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) return true
    if (taskInstance.ownerId === userId) return true

    // Check task-level collaborator
    const isTaskCollaborator = await prisma.taskInstanceCollaborator.findUnique({
      where: { taskInstanceId_userId: { taskInstanceId: taskInstance.id, userId } }
    })

    if (isTaskCollaborator) {
      return ['view', 'update_status', 'execute_request', 'add_comment'].includes(action)
    }

    // Check board-level collaborator (board collaborators can access all tasks in the board)
    if (taskInstance.boardId) {
      const isBoardCollaborator = await prisma.boardCollaborator.findUnique({
        where: { boardId_userId: { boardId: taskInstance.boardId, userId } }
      })

      if (isBoardCollaborator) {
        return ['view', 'update_status', 'execute_request', 'add_comment'].includes(action)
      }
    }

    // Non-owner, non-collaborator, non-admin cannot access
    return false
  }

  /**
   * Resolve stakeholder count from stakeholder definitions
   */
  static async resolveStakeholderCount(
    stakeholders: TaskInstanceStakeholder[],
    organizationId: string
  ): Promise<number> {
    if (stakeholders.length === 0) return 0

    const contactIds = new Set<string>()

    for (const stakeholder of stakeholders) {
      if (stakeholder.type === "individual") {
        contactIds.add(stakeholder.id)
      } else if (stakeholder.type === "group") {
        const groupEntities = await prisma.entity.findMany({
          where: {
            organizationId,
            groups: { some: { id: stakeholder.id } }
          },
          select: { id: true }
        })
        groupEntities.forEach(e => contactIds.add(e.id))
      } else if (stakeholder.type === "contact_type") {
        const typeEntities = await prisma.entity.findMany({
          where: {
            organizationId,
            contactType: stakeholder.id as any
          },
          select: { id: true }
        })
        typeEntities.forEach(e => contactIds.add(e.id))
      }
    }

    return contactIds.size
  }

  /**
   * Create a new TaskInstance
   */
  static async create(input: CreateTaskInstanceInput): Promise<TaskInstanceWithStats> {
    let labels: TaskInstanceLabels | null = null
    if (input.labels || input.tags) {
      labels = {
        ...(input.labels || {}),
        tags: input.tags || input.labels?.tags || []
      }
    }

    const taskInstance = await prisma.taskInstance.create({
      data: {
        organizationId: input.organizationId,
        lineageId: input.lineageId,
        ownerId: input.ownerId,
        name: input.name,
        description: input.description,
        clientId: input.clientId,
        boardId: input.boardId,
        dueDate: input.dueDate,
        labels: labels as any,
        status: JobStatus.NOT_STARTED
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    })

    return {
      ...taskInstance,
      labels: taskInstance.labels as TaskInstanceLabels | null,
      customFields: taskInstance.customFields as Record<string, any> | null,
      collaborators: [],
      requestCount: 0,
      respondedCount: 0,
      completedCount: 0
    } as TaskInstanceWithStats
  }

  /**
   * Find a TaskInstance by ID
   */
  static async findById(id: string, organizationId: string): Promise<TaskInstanceWithStats | null> {
    const taskInstance = await prisma.taskInstance.findFirst({
      where: { id, organizationId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        requests: { select: { id: true, status: true } },
        _count: { select: { collectedItems: true, generatedReports: true, reconciliationRuns: true } },
        board: { select: { id: true, name: true, cadence: true, periodStart: true, periodEnd: true } }
      }
    })

    if (!taskInstance) return null

    const requestCount = taskInstance.requests.length
    const respondedCount = taskInstance.requests.filter(t => 
      t.status === TaskStatus.REPLIED || 
      t.status === TaskStatus.COMPLETE
    ).length
    const completedCount = taskInstance.requests.filter(t => 
      t.status === TaskStatus.COMPLETE
    ).length

    return {
      ...taskInstance,
      labels: taskInstance.labels as TaskInstanceLabels | null,
      customFields: taskInstance.customFields as Record<string, any> | null,
      requestCount,
      respondedCount,
      completedCount,
      collectedItemCount: taskInstance._count.collectedItems,
      generatedReportCount: taskInstance._count.generatedReports,
      reconciliationRunCount: taskInstance._count.reconciliationRuns,
    } as TaskInstanceWithStats
  }

  /**
   * List TaskInstances for an organization
   */
  static async findByOrganization(
    organizationId: string,
    options?: {
      userId?: string
      userRole?: UserRole | string
      orgActionPermissions?: OrgActionPermissions
      status?: JobStatus
      clientId?: string
      boardId?: string
      ownerId?: string
      collaboratorId?: string
      tags?: string[]
      includeArchived?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<{ taskInstances: TaskInstanceWithStats[]; total: number }> {
    let where: any = {
      organizationId,
      ...(options?.status && { status: options.status }),
      ...(options?.clientId && { clientId: options.clientId }),
      ...(options?.boardId && { boardId: options.boardId })
    }

    if (!options?.includeArchived && options?.status !== JobStatus.ARCHIVED) {
      where.status = { not: JobStatus.ARCHIVED }
      if (options?.status) {
        where.status = options.status
      }
    }

    const canViewAll = canPerformAction(options?.userRole, "tasks:view_all", options?.orgActionPermissions)

    if (options?.userId && !canViewAll) {
      where = {
        ...where,
        OR: [
          { ownerId: options.userId },
          { collaborators: { some: { userId: options.userId } } }
        ]
      }
    } else if (options?.ownerId) {
      where.ownerId = options.ownerId
    }

    if (options?.tags && options.tags.length > 0) {
      where.OR = [
        ...(where.OR || []),
        ...options.tags.map(tag => ({
          labels: { path: ['tags'], array_contains: tag }
        }))
      ]
    }

    const [instances, total] = await Promise.all([
      prisma.taskInstance.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          collaborators: {
            include: { user: { select: { id: true, name: true, email: true } } }
          },
          client: { select: { id: true, firstName: true, lastName: true, email: true } },
          requests: { select: { id: true, status: true } },
          _count: { select: { collectedItems: true, generatedReports: true, reconciliationRuns: true } }
        },
        orderBy: { updatedAt: "desc" },
        take: options?.limit || 50,
        skip: options?.offset || 0
      }),
      prisma.taskInstance.count({ where })
    ])

    const instancesWithStats: TaskInstanceWithStats[] = await Promise.all(
      instances.map(async (instance) => {
        const requestCount = instance.requests.length
        const respondedCount = instance.requests.filter(t => 
          t.status === TaskStatus.REPLIED || 
          t.status === TaskStatus.COMPLETE
        ).length
        const completedCount = instance.requests.filter(t => 
          t.status === TaskStatus.COMPLETE
        ).length

        const labels = instance.labels as TaskInstanceLabels | null
        const stakeholders = labels?.stakeholders || []
        const stakeholderCount = await this.resolveStakeholderCount(stakeholders, organizationId)

        return {
          ...instance,
          labels,
          customFields: instance.customFields as Record<string, any> | null,
          requestCount,
          respondedCount,
          completedCount,
          stakeholderCount,
          collectedItemCount: instance._count.collectedItems,
          generatedReportCount: instance._count.generatedReports,
          reconciliationRunCount: instance._count.reconciliationRuns,
        } as TaskInstanceWithStats
      })
    )

    return { taskInstances: instancesWithStats, total }
  }

  /**
   * Update a TaskInstance
   */
  static async update(
    id: string,
    organizationId: string,
    input: UpdateTaskInstanceInput
  ): Promise<TaskInstanceWithStats | null> {
    const existing = await prisma.taskInstance.findFirst({
      where: { id, organizationId }
    })

    if (!existing) return null

    const updateData: any = {}
    if (input.name !== undefined) updateData.name = input.name
    if (input.description !== undefined) updateData.description = input.description
    if (input.clientId !== undefined) updateData.clientId = input.clientId
    if (input.ownerId !== undefined) updateData.ownerId = input.ownerId
    if (input.boardId !== undefined) updateData.boardId = input.boardId
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder
    if (input.status !== undefined) updateData.status = input.status
    if (input.dueDate !== undefined) updateData.dueDate = input.dueDate
    if (input.labels !== undefined) updateData.labels = input.labels
    if (input.notes !== undefined) updateData.notes = input.notes
    if (input.customFields !== undefined) updateData.customFields = input.customFields
    if (input.structuredData !== undefined) updateData.structuredData = input.structuredData
    if (input.isSnapshot !== undefined) updateData.isSnapshot = input.isSnapshot
    if (input.reportDefinitionId !== undefined) updateData.reportDefinitionId = input.reportDefinitionId
    if (input.reportFilterBindings !== undefined) updateData.reportFilterBindings = input.reportFilterBindings
    if (input.reconciliationConfigId !== undefined) updateData.reconciliationConfigId = input.reconciliationConfigId

    const instance = await prisma.taskInstance.update({
      where: { id },
      data: updateData,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        requests: { select: { id: true, status: true } },
        _count: { select: { collectedItems: true, generatedReports: true, reconciliationRuns: true } }
      }
    })

    const inst = instance as any
    return {
      ...instance,
      labels: instance.labels as TaskInstanceLabels | null,
      customFields: instance.customFields as Record<string, any> | null,
      requestCount: inst.requests.length,
      respondedCount: inst.requests.filter((t: any) => t.status === TaskStatus.REPLIED || t.status === TaskStatus.COMPLETE).length,
      completedCount: inst.requests.filter((t: any) => t.status === TaskStatus.COMPLETE).length,
      collectedItemCount: inst._count.collectedItems,
      generatedReportCount: inst._count.generatedReports,
      reconciliationRunCount: inst._count.reconciliationRuns,
    } as TaskInstanceWithStats
  }

  /**
   * Delete a TaskInstance
   */
  static async delete(
    id: string,
    organizationId: string,
    options?: { hard?: boolean }
  ): Promise<{ success: boolean; requestCount?: number; error?: string }> {
    const existing = await prisma.taskInstance.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { requests: true } } }
    })

    if (!existing) return { success: false, error: "Task instance not found" }

    const requestCount = existing._count.requests

    if (options?.hard && requestCount > 0) {
      return { 
        success: false, 
        requestCount,
        error: "This task has requests and cannot be permanently deleted. Archive it instead to preserve evidence."
      }
    }

    if (options?.hard) {
      await prisma.taskInstance.delete({ where: { id } })
    } else {
      await prisma.taskInstance.update({
        where: { id },
        data: { status: JobStatus.ARCHIVED }
      })
    }

    return { success: true, requestCount }
  }

  /**
   * Mark a task instance as IN_PROGRESS if currently NOT_STARTED
   * Used to auto-transition when work begins (sending request, uploading data, etc.)
   */
  static async markInProgressIfNotStarted(
    id: string,
    organizationId: string
  ): Promise<boolean> {
    const instance = await prisma.taskInstance.findFirst({
      where: { id, organizationId }
    })

    if (!instance) return false
    
    // Only transition from NOT_STARTED to IN_PROGRESS
    if (instance.status !== JobStatus.NOT_STARTED) return false

    await prisma.taskInstance.update({
      where: { id },
      data: { status: JobStatus.IN_PROGRESS }
    })

    // Also update parent board status if needed
    if (instance.boardId) {
      const { BoardService } = await import("./board.service")
      await (BoardService as any).recomputeBoardStatus?.(instance.boardId, organizationId)
    }

    return true
  }

  /**
   * Associate existing requests with a task instance
   */
  static async associateRequests(
    taskInstanceId: string,
    requestIds: string[],
    organizationId: string
  ): Promise<number> {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) throw new Error("Task instance not found")

    const result = await prisma.request.updateMany({
      where: { id: { in: requestIds }, organizationId },
      data: { taskInstanceId }
    })

    return result.count
  }

  /**
   * Add a collaborator
   */
  static async addCollaborator(
    taskInstanceId: string,
    userId: string,
    addedBy: string,
    organizationId: string,
    role: string = "collaborator"
  ): Promise<any> {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) return null
    if (instance.ownerId === userId) throw new Error("Cannot add owner as collaborator")

    return prisma.taskInstanceCollaborator.upsert({
      where: { taskInstanceId_userId: { taskInstanceId, userId } },
      create: { taskInstanceId, userId, role, addedBy },
      update: { role, addedBy, addedAt: new Date() },
      include: { user: { select: { id: true, name: true, email: true } } }
    })
  }

  /**
   * Get collaborators for a task instance
   */
  static async getCollaborators(
    taskInstanceId: string,
    organizationId: string
  ): Promise<TaskInstanceCollaborator[]> {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) return []

    const collaborators = await prisma.taskInstanceCollaborator.findMany({
      where: { taskInstanceId },
      include: { user: { select: { id: true, name: true, email: true } } }
    })

    return collaborators as TaskInstanceCollaborator[]
  }

  /**
   * Remove a collaborator
   */
  static async removeCollaborator(
    taskInstanceId: string,
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) return false

    try {
      await prisma.taskInstanceCollaborator.delete({
        where: { taskInstanceId_userId: { taskInstanceId, userId } }
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Add a comment
   */
  static async addComment(
    taskInstanceId: string,
    authorId: string,
    content: string,
    organizationId: string,
    mentions?: string[]
  ): Promise<any> {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) return null

    return prisma.taskInstanceComment.create({
      data: { taskInstanceId, authorId, content, mentions: mentions ?? undefined },
      include: { author: { select: { id: true, name: true, email: true } } }
    })
  }

  /**
   * Get comments for a task instance
   */
  static async getComments(
    taskInstanceId: string,
    organizationId: string
  ): Promise<any[]> {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) return []

    return prisma.taskInstanceComment.findMany({
      where: { taskInstanceId },
      include: { author: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }
    })
  }

  /**
   * Delete a comment
   */
  static async deleteComment(
    commentId: string,
    authorId: string,
    organizationId: string
  ): Promise<boolean> {
    const comment = await prisma.taskInstanceComment.findFirst({
      where: { id: commentId },
      include: { taskInstance: { select: { organizationId: true } } }
    })

    if (!comment || comment.taskInstance.organizationId !== organizationId) {
      return false
    }

    // Only the author can delete their own comment
    if (comment.authorId !== authorId) {
      return false
    }

    await prisma.taskInstanceComment.delete({
      where: { id: commentId }
    })

    return true
  }
}
