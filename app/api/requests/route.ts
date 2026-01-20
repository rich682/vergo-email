import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskStatus } from "@prisma/client"
import { getJobAccessFilter } from "@/lib/permissions"

export const dynamic = "force-dynamic"

/**
 * GET /api/requests
 * List all requests (Tasks) for the organization
 * Each Task represents a request sent to one contact (initial email, not reminders)
 * 
 * Role-Based Access:
 * - ADMIN: Sees all requests
 * - MEMBER/VIEWER: Only sees requests from jobs they own or collaborate on
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as string | undefined

    // Parse query params for filters and pagination
    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get("boardId")
    const jobId = searchParams.get("jobId")
    const ownerId = searchParams.get("ownerId")
    const status = searchParams.get("status") as TaskStatus | null
    const labelId = searchParams.get("labelId")
    const readStatus = searchParams.get("readStatus") // unread | read | replied
    const hasAttachments = searchParams.get("hasAttachments") // yes | no
    
    // Pagination params
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100) // Max 100
    const skip = (page - 1) * limit

    // Get job access filter based on user role
    const jobAccessFilter = getJobAccessFilter(userId, userRole)

    const where: any = {
      organizationId,
      // Only show tasks that have a job (request-based tasks)
      jobId: { not: null },
      // Role-based access: only show requests from jobs user can access
      ...(jobAccessFilter && { job: jobAccessFilter })
    }

    // Filter by read status
    if (readStatus === "unread") {
      where.readStatus = { in: [null, "unread"] }
    } else if (readStatus === "read") {
      where.readStatus = "read"
    } else if (readStatus === "replied") {
      where.readStatus = "replied"
    }

    // Filter by attachments
    if (hasAttachments === "yes") {
      where.hasAttachments = true
    } else if (hasAttachments === "no") {
      where.hasAttachments = false
    }

    // Filter by board (via job.boardId)
    if (boardId) {
      where.job = {
        ...where.job,
        boardId
      }
    }

    if (jobId) {
      where.jobId = jobId
    }

    // Handle status filter with legacy status mapping
    if (status) {
      // Map new status values to include legacy equivalents
      const statusMapping: Record<string, TaskStatus[]> = {
        NO_REPLY: [TaskStatus.NO_REPLY, TaskStatus.IN_PROGRESS, TaskStatus.AWAITING_RESPONSE, TaskStatus.FLAGGED, TaskStatus.MANUAL_REVIEW, TaskStatus.ON_HOLD],
        REPLIED: [TaskStatus.REPLIED, TaskStatus.HAS_ATTACHMENTS, TaskStatus.VERIFYING],
        COMPLETE: [TaskStatus.COMPLETE, TaskStatus.FULFILLED, TaskStatus.REJECTED],
      }
      
      const mappedStatuses = statusMapping[status]
      if (mappedStatuses) {
        where.status = { in: mappedStatuses }
      } else if (Object.values(TaskStatus).includes(status as TaskStatus)) {
        // Direct status match for legacy statuses
        where.status = status
      }
    }

    // Filter by label (label is on the job)
    if (labelId) {
      where.job = {
        jobLabels: {
          some: { id: labelId }
        }
      }
    }

    // Get total count for pagination
    const totalCount = await prisma.task.count({ where })

    // Build the query with pagination
    const tasks = await prisma.task.findMany({
      where,
      include: {
        entity: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyName: true
          }
        },
        job: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            boardId: true,
            board: {
              select: {
                id: true,
                name: true
              }
            },
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            jobLabels: {
              select: {
                id: true,
                name: true,
                color: true
              }
            }
          }
        },
        // Include message count for reply indicator
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    })

    // Filter by owner if specified (owner is on the job, not the task)
    let filteredTasks = tasks
    if (ownerId) {
      filteredTasks = tasks.filter(t => t.job?.ownerId === ownerId)
    }

    // Get only jobs that have sent requests (tasks with jobId), filtered by access
    const jobsWithRequests = await prisma.job.findMany({
      where: { 
        organizationId,
        tasks: {
          some: {} // Has at least one task
        },
        // Apply same access filter for dropdown
        ...(jobAccessFilter || {})
      },
      select: {
        id: true,
        name: true
      },
      orderBy: { name: "asc" }
    })

    // Get unique owners for filter dropdown
    const owners = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true
      },
      orderBy: { name: "asc" }
    })

    // Get all labels from jobs that have requests
    const labelsFromJobs = await prisma.jobLabel.findMany({
      where: {
        job: {
          organizationId,
          tasks: {
            some: {}
          }
        }
      },
      select: {
        id: true,
        name: true,
        color: true
      },
      distinct: ["name"],
      orderBy: { name: "asc" }
    })

    // Get status counts
    const statusCounts = await prisma.task.groupBy({
      by: ["status"],
      where: {
        organizationId,
        jobId: { not: null }
      },
      _count: true
    })

    const statusSummary = statusCounts.reduce((acc, item) => {
      acc[item.status] = item._count
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      success: true,
      requests: filteredTasks,
      total: ownerId ? filteredTasks.length : totalCount, // Use filtered count if owner filter applied client-side
      page,
      limit,
      totalPages: Math.ceil((ownerId ? filteredTasks.length : totalCount) / limit),
      jobs: jobsWithRequests, // Only jobs with requests
      owners,
      labels: labelsFromJobs, // Labels for filtering
      statusSummary
    })
  } catch (error: any) {
    console.error("Error fetching requests:", error)
    return NextResponse.json(
      { error: "Failed to fetch requests", message: error.message },
      { status: 500 }
    )
  }
}
