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
 * Phase 2+: Status derivation, aggregation, notifications
 */

import { prisma } from "@/lib/prisma"
import { JobStatus, TaskStatus } from "@prisma/client"

export interface CreateJobInput {
  organizationId: string
  name: string
  description?: string
  clientId?: string
  dueDate?: Date
  labels?: string[]
}

export interface UpdateJobInput {
  name?: string
  description?: string
  clientId?: string | null
  status?: JobStatus
  dueDate?: Date | null
  labels?: string[]
}

export interface JobWithStats {
  id: string
  organizationId: string
  name: string
  description: string | null
  clientId: string | null
  status: JobStatus
  dueDate: Date | null
  labels: string[] | null
  createdAt: Date
  updatedAt: Date
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
}

export class JobService {
  /**
   * Create a new Job
   */
  static async create(input: CreateJobInput): Promise<JobWithStats> {
    const job = await prisma.job.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        clientId: input.clientId,
        dueDate: input.dueDate,
        labels: input.labels || null,
        status: JobStatus.ACTIVE
      },
      include: {
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
      labels: job.labels as string[] | null,
      taskCount: 0,
      respondedCount: 0,
      completedCount: 0
    }
  }

  /**
   * Find a Job by ID
   */
  static async findById(id: string, organizationId: string): Promise<JobWithStats | null> {
    const job = await prisma.job.findFirst({
      where: {
        id,
        organizationId
      },
      include: {
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
      t.status === TaskStatus.FULFILLED ||
      t.status === TaskStatus.HAS_ATTACHMENTS
    ).length
    const completedCount = job.tasks.filter(t => 
      t.status === TaskStatus.FULFILLED
    ).length

    return {
      id: job.id,
      organizationId: job.organizationId,
      name: job.name,
      description: job.description,
      clientId: job.clientId,
      status: job.status,
      dueDate: job.dueDate,
      labels: job.labels as string[] | null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      client: job.client,
      taskCount,
      respondedCount,
      completedCount
    }
  }

  /**
   * List Jobs for an organization
   */
  static async findByOrganization(
    organizationId: string,
    options?: {
      status?: JobStatus
      clientId?: string
      limit?: number
      offset?: number
    }
  ): Promise<{ jobs: JobWithStats[]; total: number }> {
    const where = {
      organizationId,
      ...(options?.status && { status: options.status }),
      ...(options?.clientId && { clientId: options.clientId })
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
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

    const jobsWithStats: JobWithStats[] = jobs.map(job => {
      const taskCount = job.tasks.length
      const respondedCount = job.tasks.filter(t => 
        t.status === TaskStatus.REPLIED || 
        t.status === TaskStatus.FULFILLED ||
        t.status === TaskStatus.HAS_ATTACHMENTS
      ).length
      const completedCount = job.tasks.filter(t => 
        t.status === TaskStatus.FULFILLED
      ).length

      return {
        id: job.id,
        organizationId: job.organizationId,
        name: job.name,
        description: job.description,
        clientId: job.clientId,
        status: job.status,
        dueDate: job.dueDate,
        labels: job.labels as string[] | null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        client: job.client,
        taskCount,
        respondedCount,
        completedCount
      }
    })

    return { jobs: jobsWithStats, total }
  }

  /**
   * Update a Job
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
        ...(input.status !== undefined && { status: input.status }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.labels !== undefined && { labels: input.labels })
      },
      include: {
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
      t.status === TaskStatus.FULFILLED ||
      t.status === TaskStatus.HAS_ATTACHMENTS
    ).length
    const completedCount = job.tasks.filter(t => 
      t.status === TaskStatus.FULFILLED
    ).length

    return {
      id: job.id,
      organizationId: job.organizationId,
      name: job.name,
      description: job.description,
      clientId: job.clientId,
      status: job.status,
      dueDate: job.dueDate,
      labels: job.labels as string[] | null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
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

    const allFulfilled = tasks.every(t => t.status === TaskStatus.FULFILLED)
    if (allFulfilled) return JobStatus.COMPLETED

    const anyAwaiting = tasks.some(t => t.status === TaskStatus.AWAITING_RESPONSE)
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
}
