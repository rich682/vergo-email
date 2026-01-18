/**
 * Job Service
 * 
 * Manages Job lifecycle - the persistent work container that owns Tasks (requests).
 * Jobs enable task-centric workflows where:
 * - A Job represents ongoing client work (e.g., "Tax Planning - Year End")
 * - Tasks (requests) are actions taken within a Job
 * - Status is derived from child Task states
 * 
 * Phase 1: Basic CRUD operations
 * Phase 2: Ownership & Collaboration
 * Phase 3+: Status derivation, aggregation, notifications
 * 
 * Ownership Model:
 * - Each Job has a single owner (ownerId) who is accountable
 * - Collaborators can view and execute but not edit
 * - All Jobs are visible org-wide by default
 */

import { prisma } from "@/lib/prisma"
import { JobStatus, TaskStatus, UserRole } from "@prisma/client"

export interface JobStakeholder {
  type: "contact_type" | "group" | "individual"
  id: string
  name: string
}

export interface JobLabels {
  tags?: string[]
  period?: string
  workType?: string
  stakeholders?: JobStakeholder[]
}

export interface CreateJobInput {
  organizationId: string
  ownerId: string  // Required: accountable user
  name: string
  description?: string
  clientId?: string
  boardId?: string  // Optional: parent board for period-based organization
  dueDate?: Date
  labels?: JobLabels  // Structured labels with tags, period, workType
  tags?: string[]     // Convenience: will be merged into labels.tags
}

export interface UpdateJobInput {
  name?: string
  description?: string
  clientId?: string | null
  ownerId?: string  // Can transfer ownership
  boardId?: string | null  // Can move between boards
  sortOrder?: number  // Order within board
  status?: JobStatus
  dueDate?: Date | null
  labels?: JobLabels  // Structured labels with tags, period, workType
  tags?: string[]     // Convenience: will be merged into labels.tags
  notes?: string | null  // User notes for the task
  customFields?: Record<string, any>  // Custom column data for configurable table
}

export interface JobOwner {
  id: string
  name: string | null
  email: string
}

export interface JobCollaborator {
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

export interface JobWithStats {
  id: string
  organizationId: string
  ownerId: string
  name: string
  description: string | null
  clientId: string | null
  status: JobStatus
  dueDate: Date | null
  labels: JobLabels | null  // Structured labels with tags, period, workType
  createdAt: Date
  updatedAt: Date
  owner: JobOwner
  collaborators?: JobCollaborator[]
  client?: {
    id: string
    firstName: string
    lastName: string | null
    email: string | null
  } | null
  // Computed stats
  taskCount: number
  respondedCount: number
  completedCount: number
  stakeholderCount?: number  // Resolved count of actual contacts
}

// Permission actions for Jobs
export type JobAction = 
  | 'view' 
  | 'edit' 
  | 'add_request' 
  | 'execute_request' 
  | 'archive' 
  | 'manage_collaborators'
  | 'add_comment'

export class JobService {
  /**
   * Check if a user can perform an action on a job
   * Implements the permission model from the plan
   */
  static async canUserAccessJob(
    userId: string,
    userRole: UserRole,
    job: { id: string; ownerId: string },
    action: JobAction
  ): Promise<boolean> {
    // Org Admins can do everything
    if (userRole === UserRole.ADMIN) return true
    
    // Owner can do everything on their Jobs
    if (job.ownerId === userId) return true
    
    // Collaborators can view, execute, and comment
    const isCollaborator = await prisma.jobCollaborator.findUnique({
      where: { jobId_userId: { jobId: job.id, userId } }
    })
    
    if (isCollaborator) {
      return ['view', 'execute_request', 'add_comment'].includes(action)
    }
    
    // Default visibility: all org members can view
    if (action === 'view') return true
    
    return false
  }

  /**
   * Resolve stakeholder count from stakeholder definitions
   * Counts actual contacts based on stakeholder type:
   * - individual: counts as 1
   * - group: counts all entities in the group
   * - contact_type: counts all entities with that contact type
   */
  static async resolveStakeholderCount(
    stakeholders: JobStakeholder[],
    organizationId: string
  ): Promise<number> {
    if (stakeholders.length === 0) return 0

    const contactIds = new Set<string>()

    for (const stakeholder of stakeholders) {
      if (stakeholder.type === "individual") {
        // Individual stakeholder - just add the ID
        contactIds.add(stakeholder.id)
      } else if (stakeholder.type === "group") {
        // Get all entities in this group
        const groupEntities = await prisma.entity.findMany({
          where: {
            organizationId,
            groups: { some: { id: stakeholder.id } }
          },
          select: { id: true }
        })
        groupEntities.forEach(e => contactIds.add(e.id))
      } else if (stakeholder.type === "contact_type") {
        // Get all entities with this contact type
        const typeEntities = await prisma.entity.findMany({
          where: {
            organizationId,
            contactType: stakeholder.id
          },
          select: { id: true }
        })
        typeEntities.forEach(e => contactIds.add(e.id))
      }
    }

    return contactIds.size
  }

  /**
   * Create a new Job
   * Owner defaults to the creating user
   */
  static async create(input: CreateJobInput): Promise<JobWithStats> {
    // Build labels object, merging tags convenience field
    let labels: JobLabels | null = null
    if (input.labels || input.tags) {
      labels = {
        ...(input.labels || {}),
        tags: input.tags || input.labels?.tags || []
      }
    }

    const job = await prisma.job.create({
      data: {
        organizationId: input.organizationId,
        ownerId: input.ownerId,
        name: input.name,
        description: input.description,
        clientId: input.clientId,
        boardId: input.boardId,
        dueDate: input.dueDate,
        labels: labels,
        status: JobStatus.NOT_STARTED  // New jobs start as "Not Started"
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    })

    return {
      ...job,
      labels: job.labels as JobLabels | null,
      collaborators: [],
      taskCount: 0,
      respondedCount: 0,
      completedCount: 0
    }
  }

  /**
   * Find a Job by ID
   * Includes owner and collaborators
   */
  static async findById(id: string, organizationId: string): Promise<JobWithStats | null> {
    const job = await prisma.job.findFirst({
      where: {
        id,
        organizationId
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        tasks: {
          select: {
            id: true,
            status: true
          }
        }
      }
    })

    if (!job) return null

    // Compute stats from tasks
    const taskCount = job.tasks.length
    const respondedCount = job.tasks.filter(t => 
      t.status === TaskStatus.REPLIED || 
      t.status === TaskStatus.COMPLETE ||
      t.status === TaskStatus.FULFILLED ||  // legacy
      t.status === TaskStatus.HAS_ATTACHMENTS  // legacy
    ).length
    const completedCount = job.tasks.filter(t => 
      t.status === TaskStatus.COMPLETE ||
      t.status === TaskStatus.FULFILLED  // legacy
    ).length

    return {
      id: job.id,
      organizationId: job.organizationId,
      ownerId: job.ownerId,
      name: job.name,
      description: job.description,
      clientId: job.clientId,
      status: job.status,
      dueDate: job.dueDate,
      labels: job.labels as JobLabels | null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      owner: job.owner,
      collaborators: job.collaborators,
      client: job.client,
      taskCount,
      respondedCount,
      completedCount
    }
  }

  /**
   * List Jobs for an organization
   * Supports filtering by owner ("My Jobs"), tags, or showing all
   */
  static async findByOrganization(
    organizationId: string,
    options?: {
      status?: JobStatus
      clientId?: string
      boardId?: string  // Filter by board
      ownerId?: string  // Filter by owner ("My Jobs")
      collaboratorId?: string  // Include jobs where user is collaborator
      tags?: string[]  // Filter by tags (ANY match)
      limit?: number
      offset?: number
    }
  ): Promise<{ jobs: JobWithStats[]; total: number }> {
    // Build where clause
    let where: any = {
      organizationId,
      ...(options?.status && { status: options.status }),
      ...(options?.clientId && { clientId: options.clientId }),
      ...(options?.boardId && { boardId: options.boardId })
    }

    // If filtering by "My Jobs" (owner or collaborator)
    if (options?.ownerId && options?.collaboratorId && options.ownerId === options.collaboratorId) {
      // Show jobs where user is owner OR collaborator
      where = {
        ...where,
        OR: [
          { ownerId: options.ownerId },
          { collaborators: { some: { userId: options.collaboratorId } } }
        ]
      }
    } else if (options?.ownerId) {
      where.ownerId = options.ownerId
    }

    // Filter by tags (ANY match - job has at least one of the specified tags)
    if (options?.tags && options.tags.length > 0) {
      // Use Prisma JSON filtering: labels.tags contains any of the specified tags
      // For "any" match, we use OR with array_contains for each tag
      where.OR = [
        ...(where.OR || []),
        ...options.tags.map(tag => ({
          labels: {
            path: ['tags'],
            array_contains: tag
          }
        }))
      ]
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          collaborators: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          },
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          tasks: {
            select: {
              id: true,
              status: true
            }
          }
        },
        orderBy: { updatedAt: "desc" },
        take: options?.limit || 50,
        skip: options?.offset || 0
      }),
      prisma.job.count({ where })
    ])

    // Process jobs with stakeholder counts
    const jobsWithStats: JobWithStats[] = await Promise.all(
      jobs.map(async (job) => {
        const taskCount = job.tasks.length
        const respondedCount = job.tasks.filter(t => 
          t.status === TaskStatus.REPLIED || 
          t.status === TaskStatus.COMPLETE ||
          t.status === TaskStatus.FULFILLED ||  // legacy
          t.status === TaskStatus.HAS_ATTACHMENTS  // legacy
        ).length
        const completedCount = job.tasks.filter(t => 
          t.status === TaskStatus.COMPLETE ||
          t.status === TaskStatus.FULFILLED  // legacy
        ).length

        // Resolve stakeholder count from labels
        const labels = job.labels as JobLabels | null
        const stakeholders = labels?.stakeholders || []
        const stakeholderCount = await this.resolveStakeholderCount(stakeholders, organizationId)

        return {
          id: job.id,
          organizationId: job.organizationId,
          ownerId: job.ownerId,
          name: job.name,
          description: job.description,
          clientId: job.clientId,
          status: job.status,
          dueDate: job.dueDate,
          labels: labels,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          owner: job.owner,
          collaborators: job.collaborators,
          client: job.client,
          taskCount,
          respondedCount,
          completedCount,
          stakeholderCount
        }
      })
    )

    return { jobs: jobsWithStats, total }
  }

  /**
   * Update a Job
   * Supports ownership transfer
   */
  static async update(
    id: string,
    organizationId: string,
    input: UpdateJobInput
  ): Promise<JobWithStats | null> {
    // Verify job exists and belongs to organization
    const existing = await prisma.job.findFirst({
      where: { id, organizationId }
    })

    if (!existing) return null

    const job = await prisma.job.update({
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
        ...(input.labels !== undefined && { labels: input.labels }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.customFields !== undefined && { customFields: input.customFields })
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        tasks: {
          select: {
            id: true,
            status: true
          }
        }
      }
    })

    const taskCount = job.tasks.length
    const respondedCount = job.tasks.filter(t => 
      t.status === TaskStatus.REPLIED || 
      t.status === TaskStatus.COMPLETE ||
      t.status === TaskStatus.FULFILLED ||  // legacy
      t.status === TaskStatus.HAS_ATTACHMENTS  // legacy
    ).length
    const completedCount = job.tasks.filter(t => 
      t.status === TaskStatus.COMPLETE ||
      t.status === TaskStatus.FULFILLED  // legacy
    ).length

    return {
      id: job.id,
      organizationId: job.organizationId,
      ownerId: job.ownerId,
      name: job.name,
      description: job.description,
      clientId: job.clientId,
      status: job.status,
      dueDate: job.dueDate,
      labels: job.labels as string[] | null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      owner: job.owner,
      collaborators: job.collaborators,
      client: job.client,
      taskCount,
      respondedCount,
      completedCount
    }
  }

  /**
   * Delete a Job (soft delete by archiving, or hard delete)
   */
  static async delete(
    id: string,
    organizationId: string,
    options?: { hard?: boolean }
  ): Promise<boolean> {
    const existing = await prisma.job.findFirst({
      where: { id, organizationId }
    })

    if (!existing) return false

    if (options?.hard) {
      // Hard delete - tasks will have jobId set to null due to onDelete: SetNull
      await prisma.job.delete({
        where: { id }
      })
    } else {
      // Soft delete - archive the job
      await prisma.job.update({
        where: { id },
        data: { status: JobStatus.ARCHIVED }
      })
    }

    return true
  }

  /**
   * Compute derived status from child tasks
   * This is used for Phase 4 status derivation
   */
  static computeDerivedStatus(tasks: Array<{ status: TaskStatus }>): JobStatus {
    if (tasks.length === 0) return JobStatus.ACTIVE

    const allComplete = tasks.every(t => 
      t.status === TaskStatus.COMPLETE || 
      t.status === TaskStatus.FULFILLED  // legacy
    )
    if (allComplete) return JobStatus.COMPLETED

    const anyAwaiting = tasks.some(t => 
      t.status === TaskStatus.NO_REPLY ||
      t.status === TaskStatus.AWAITING_RESPONSE ||  // legacy
      t.status === TaskStatus.IN_PROGRESS  // legacy
    )
    if (anyAwaiting) return JobStatus.WAITING

    return JobStatus.ACTIVE
  }

  /**
   * Associate existing tasks with a job
   */
  static async associateTasks(
    jobId: string,
    taskIds: string[],
    organizationId: string
  ): Promise<number> {
    // Verify job exists
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      throw new Error("Job not found")
    }

    // Update tasks to associate with job
    const result = await prisma.task.updateMany({
      where: {
        id: { in: taskIds },
        organizationId
      },
      data: {
        jobId
      }
    })

    return result.count
  }

  /**
   * Disassociate tasks from a job
   */
  static async disassociateTasks(
    taskIds: string[],
    organizationId: string
  ): Promise<number> {
    const result = await prisma.task.updateMany({
      where: {
        id: { in: taskIds },
        organizationId
      },
      data: {
        jobId: null
      }
    })

    return result.count
  }

  // ============================================
  // Collaborator Management
  // ============================================

  /**
   * Add a collaborator to a job
   */
  static async addCollaborator(
    jobId: string,
    userId: string,
    addedBy: string,
    organizationId: string,
    role: string = "collaborator"
  ): Promise<JobCollaborator | null> {
    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) return null

    // Don't add owner as collaborator
    if (job.ownerId === userId) {
      throw new Error("Cannot add job owner as collaborator")
    }

    // Verify user exists and belongs to same organization
    const user = await prisma.user.findFirst({
      where: { id: userId, organizationId }
    })

    if (!user) {
      throw new Error("User not found in organization")
    }

    // Create or update collaborator
    const collaborator = await prisma.jobCollaborator.upsert({
      where: {
        jobId_userId: { jobId, userId }
      },
      create: {
        jobId,
        userId,
        role,
        addedBy
      },
      update: {
        role,
        addedBy,
        addedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return collaborator
  }

  /**
   * Remove a collaborator from a job
   */
  static async removeCollaborator(
    jobId: string,
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) return false

    try {
      await prisma.jobCollaborator.delete({
        where: {
          jobId_userId: { jobId, userId }
        }
      })
      return true
    } catch {
      // Collaborator doesn't exist
      return false
    }
  }

  /**
   * Get all collaborators for a job
   */
  static async getCollaborators(
    jobId: string,
    organizationId: string
  ): Promise<JobCollaborator[]> {
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) return []

    const collaborators = await prisma.jobCollaborator.findMany({
      where: { jobId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { addedAt: "asc" }
    })

    return collaborators
  }

  /**
   * Transfer job ownership to another user
   */
  static async transferOwnership(
    jobId: string,
    newOwnerId: string,
    organizationId: string
  ): Promise<JobWithStats | null> {
    // Verify job exists
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) return null

    // Verify new owner exists in organization
    const newOwner = await prisma.user.findFirst({
      where: { id: newOwnerId, organizationId }
    })

    if (!newOwner) {
      throw new Error("New owner not found in organization")
    }

    // If new owner was a collaborator, remove them from collaborators
    await prisma.jobCollaborator.deleteMany({
      where: { jobId, userId: newOwnerId }
    })

    // Update ownership
    return this.update(jobId, organizationId, { ownerId: newOwnerId })
  }

  // ============================================
  // Comment Management (Phase 2.6)
  // ============================================

  /**
   * Add a comment to a job
   */
  static async addComment(
    jobId: string,
    authorId: string,
    content: string,
    organizationId: string,
    mentions?: string[]
  ): Promise<{
    id: string
    jobId: string
    authorId: string
    content: string
    mentions: string[] | null
    createdAt: Date
    author: { id: string; name: string | null; email: string }
  } | null> {
    // Verify job exists
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) return null

    const comment = await prisma.jobComment.create({
      data: {
        jobId,
        authorId,
        content,
        mentions: mentions || null
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return {
      ...comment,
      mentions: comment.mentions as string[] | null
    }
  }

  /**
   * Get comments for a job
   */
  static async getComments(
    jobId: string,
    organizationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{
    id: string
    jobId: string
    authorId: string
    content: string
    mentions: string[] | null
    createdAt: Date
    author: { id: string; name: string | null; email: string }
  }>> {
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) return []

    const comments = await prisma.jobComment.findMany({
      where: { jobId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit || 50,
      skip: options?.offset || 0
    })

    return comments.map(c => ({
      ...c,
      mentions: c.mentions as string[] | null
    }))
  }

  /**
   * Delete a comment
   */
  static async deleteComment(
    commentId: string,
    authorId: string,
    organizationId: string
  ): Promise<boolean> {
    // Verify comment exists and belongs to author
    const comment = await prisma.jobComment.findFirst({
      where: { id: commentId },
      include: {
        job: {
          select: { organizationId: true }
        }
      }
    })

    if (!comment || comment.job.organizationId !== organizationId) {
      return false
    }

    // Only author can delete their own comment
    if (comment.authorId !== authorId) {
      return false
    }

    await prisma.jobComment.delete({
      where: { id: commentId }
    })

    return true
  }
}
