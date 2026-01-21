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
 * - Collaborators can view and execute but not edit
 * - All TaskInstances are visible org-wide by default
 */

import { prisma } from "@/lib/prisma"
import { TaskInstanceStatus, TaskStatus, UserRole, TaskType } from "@prisma/client"

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
  type?: TaskType
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
  status?: TaskInstanceStatus
  dueDate?: Date | null
  labels?: TaskInstanceLabels
  tags?: string[]
  notes?: string | null
  customFields?: Record<string, any>
  structuredData?: any
  isSnapshot?: boolean
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
  type: TaskType
  ownerId: string
  name: string
  description: string | null
  clientId: string | null
  boardId: string | null
  board?: {
    id: string
    name: string
  } | null
  status: TaskInstanceStatus
  dueDate: Date | null
  labels: TaskInstanceLabels | null
  notes?: string | null
  customFields?: Record<string, any> | null
  structuredData?: any
  isSnapshot: boolean
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
}

// Permission actions for TaskInstances
export type TaskInstanceAction = 
  | 'view' 
  | 'edit' 
  | 'add_request' 
  | 'execute_request' 
  | 'archive' 
  | 'manage_collaborators'
  | 'add_comment'

export class TaskInstanceService {
  /**
   * Check if a user can perform an action on a task instance
   */
  static async canUserAccess(
    userId: string,
    userRole: UserRole,
    taskInstance: { id: string; ownerId: string },
    action: TaskInstanceAction
  ): Promise<boolean> {
    if (userRole === UserRole.ADMIN) return true
    if (taskInstance.ownerId === userId) return true
    
    const isCollaborator = await prisma.taskInstanceCollaborator.findUnique({
      where: { taskInstanceId_userId: { taskInstanceId: taskInstance.id, userId } }
    })
    
    if (isCollaborator) {
      return ['view', 'execute_request', 'add_comment'].includes(action)
    }
    
    if (action === 'view') return true
    
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
        type: input.type || TaskType.GENERIC,
        ownerId: input.ownerId,
        name: input.name,
        description: input.description,
        clientId: input.clientId,
        boardId: input.boardId,
        dueDate: input.dueDate,
        labels: labels as any,
        status: TaskInstanceStatus.NOT_STARTED
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    })

    return {
      ...taskInstance,
      labels: taskInstance.labels as TaskInstanceLabels | null,
      collaborators: [],
      requestCount: 0,
      respondedCount: 0,
      completedCount: 0
    }
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
        _count: { select: { collectedItems: true } },
        board: { select: { id: true, name: true, cadence: true } }
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
      requestCount,
      respondedCount,
      completedCount,
      collectedItemCount: taskInstance._count.collectedItems
    }
  }

  /**
   * List TaskInstances for an organization
   */
  static async findByOrganization(
    organizationId: string,
    options?: {
      userId?: string
      userRole?: UserRole | string
      status?: TaskInstanceStatus
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

    if (!options?.includeArchived && options?.status !== TaskInstanceStatus.ARCHIVED) {
      where.status = { not: TaskInstanceStatus.ARCHIVED }
      if (options?.status) {
        where.status = options.status
      }
    }

    const normalizedRole = options?.userRole?.toString().toUpperCase()
    const isAdmin = normalizedRole === "ADMIN"
    
    if (options?.userId && !isAdmin) {
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
          _count: { select: { collectedItems: true } }
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
          requestCount,
          respondedCount,
          completedCount,
          stakeholderCount,
          collectedItemCount: instance._count.collectedItems
        }
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

    const instance = await prisma.taskInstance.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.clientId !== undefined && { clientId: input.clientId }),
        ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
        ...(input.boardId !== undefined && { boardId: input.boardId }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.labels !== undefined && { labels: input.labels as any }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.customFields !== undefined && { customFields: input.customFields }),
        ...(input.structuredData !== undefined && { structuredData: input.structuredData }),
        ...(input.isSnapshot !== undefined && { isSnapshot: input.isSnapshot })
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        client: { select: { id: true, firstName: true, lastName: true, email: true } },
        requests: { select: { id: true, status: true } },
        _count: { select: { collectedItems: true } }
      }
    })

    return {
      ...instance,
      labels: instance.labels as TaskInstanceLabels | null,
      requestCount: instance.requests.length,
      respondedCount: instance.requests.filter(t => t.status === TaskStatus.REPLIED || t.status === TaskStatus.COMPLETE).length,
      completedCount: instance.requests.filter(t => t.status === TaskStatus.COMPLETE).length,
      collectedItemCount: instance._count.collectedItems
    }
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
        data: { status: TaskInstanceStatus.ARCHIVED }
      })
    }

    return { success: true, requestCount }
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
      data: { taskInstanceId, authorId, content, mentions: mentions || null },
      include: { author: { select: { id: true, name: true, email: true } } }
    })
  }
}
