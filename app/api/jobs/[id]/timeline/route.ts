/**
 * Job Timeline API Endpoint
 * 
 * GET /api/jobs/[id]/timeline - Get unified timeline of job activity
 * 
 * Returns a normalized list of events:
 * - Comments (from JobComment)
 * - Emails sent (from Message with direction=OUTBOUND)
 * - Replies received (from Message with direction=INBOUND)
 * - Reminders sent (from ReminderState)
 * 
 * Authorization:
 * - All org members can view (Jobs are visible org-wide by default)
 * - Timeline only returns events within the same organization
 * - No cross-org leakage via jobId or taskId joins
 * 
 * Pagination:
 * - Default limit: 50
 * - Max limit: 200
 * - Supports offset-based pagination
 * 
 * Performance:
 * - Minimal selects (no full email bodies)
 * - Index-aware queries
 * - Stable ordering by timestamp
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { JobService } from "@/lib/services/job.service"
import { UserRole } from "@prisma/client"

// Constants for pagination and performance
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_CONTENT_PREVIEW_LENGTH = 200

/**
 * Normalized timeline event shape
 * All events conform to this structure for consistent UI rendering
 */
interface TimelineEvent {
  id: string
  type: "comment" | "email_sent" | "email_reply" | "reminder_sent"
  timestamp: string
  content: string // Preview text only, not full body
  // Actor info (internal user for comments, external sender for replies)
  author?: { 
    id: string
    name: string | null
    email: string 
  }
  // Deep links for drill-down
  jobId: string
  taskId?: string
  requestName?: string // campaignName for linking to request detail
  // Recipient info (for email/reminder events)
  recipientName?: string
  recipientEmail?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: jobId } = await params
    const { searchParams } = new URL(request.url)
    
    // Parse and validate pagination parameters
    let limit = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10)
    if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT
    if (limit > MAX_LIMIT) limit = MAX_LIMIT
    
    let offset = parseInt(searchParams.get("offset") || "0", 10)
    if (isNaN(offset) || offset < 0) offset = 0
    
    const filter = searchParams.get("filter") as "all" | "emails" | "comments" | null

    // ============================================
    // Authorization Check
    // ============================================
    
    // Verify job exists and belongs to the same organization
    const job = await JobService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    // Check view permission (all org members can view by default)
    const canView = await JobService.canUserAccessJob(userId, userRole, job, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    const events: TimelineEvent[] = []

    // ============================================
    // Fetch Comments (unless filtering to emails only)
    // ============================================
    if (filter !== "emails") {
      const comments = await prisma.jobComment.findMany({
        where: { 
          jobId,
          // Ensure comment belongs to a job in the same org (defense in depth)
          job: { organizationId }
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: limit + offset, // Fetch enough to handle offset
        skip: 0 // We'll handle offset after merging
      })

      comments.forEach(comment => {
        events.push({
          id: `comment-${comment.id}`,
          type: "comment",
          timestamp: comment.createdAt.toISOString(),
          content: comment.content.length > MAX_CONTENT_PREVIEW_LENGTH 
            ? comment.content.substring(0, MAX_CONTENT_PREVIEW_LENGTH) + "..."
            : comment.content,
          author: comment.author,
          jobId
        })
      })
    }

    // ============================================
    // Fetch Messages and Reminders (unless filtering to comments only)
    // ============================================
    if (filter !== "comments") {
      // Get all tasks for this job with minimal fields
      // IMPORTANT: Filter by organizationId to prevent cross-org leakage
      const tasks = await prisma.task.findMany({
        where: { 
          jobId, 
          organizationId // Critical: ensure tasks belong to same org
        },
        select: {
          id: true,
          campaignName: true,
          entity: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      })

      const taskIds = tasks.map(t => t.id)
      const taskMap = new Map(tasks.map(t => [t.id, t]))

      if (taskIds.length > 0) {
        // Fetch messages for these tasks
        // Select only necessary fields (no full body for performance)
        const messages = await prisma.message.findMany({
          where: {
            taskId: { in: taskIds }
          },
          select: {
            id: true,
            taskId: true,
            direction: true,
            subject: true,
            createdAt: true,
            fromAddress: true
          },
          orderBy: { createdAt: "desc" },
          take: (limit + offset) * 2 // Fetch extra to account for filtering/merging
        })

        messages.forEach(message => {
          const task = taskMap.get(message.taskId)
          const recipientName = task?.entity 
            ? `${task.entity.firstName} ${task.entity.lastName || ""}`.trim()
            : undefined
          const recipientEmail = task?.entity?.email || undefined

          // For replies, show sender info; for sent, show recipient
          const content = message.subject 
            ? (message.subject.length > MAX_CONTENT_PREVIEW_LENGTH 
                ? message.subject.substring(0, MAX_CONTENT_PREVIEW_LENGTH) + "..."
                : message.subject)
            : (message.direction === "INBOUND" ? "Reply received" : "Email sent")

          events.push({
            id: `message-${message.id}`,
            type: message.direction === "INBOUND" ? "email_reply" : "email_sent",
            timestamp: message.createdAt.toISOString(),
            content,
            jobId,
            taskId: message.taskId,
            requestName: task?.campaignName || undefined,
            recipientName,
            recipientEmail
          })
        })

        // Fetch reminder states for these tasks
        const reminders = await prisma.reminderState.findMany({
          where: {
            taskId: { in: taskIds },
            sentCount: { gt: 0 },
            lastSentAt: { not: null }
          },
          select: {
            id: true,
            taskId: true,
            sentCount: true,
            lastSentAt: true
          },
          orderBy: { lastSentAt: "desc" },
          take: limit + offset
        })

        reminders.forEach(reminder => {
          if (!reminder.lastSentAt) return
          
          const task = taskMap.get(reminder.taskId)
          const recipientName = task?.entity 
            ? `${task.entity.firstName} ${task.entity.lastName || ""}`.trim()
            : undefined
          const recipientEmail = task?.entity?.email || undefined

          events.push({
            id: `reminder-${reminder.id}`,
            type: "reminder_sent",
            timestamp: reminder.lastSentAt.toISOString(),
            content: `Reminder #${reminder.sentCount} sent`,
            jobId,
            taskId: reminder.taskId,
            requestName: task?.campaignName || undefined,
            recipientName,
            recipientEmail
          })
        })
      }
    }

    // ============================================
    // Sort, Paginate, and Return
    // ============================================
    
    // Sort all events by timestamp descending (stable sort)
    events.sort((a, b) => {
      const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      if (timeDiff !== 0) return timeDiff
      // Secondary sort by id for stability
      return a.id.localeCompare(b.id)
    })

    // Apply pagination
    const totalCount = events.length
    const paginatedEvents = events.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      events: paginatedEvents,
      pagination: {
        offset,
        limit,
        total: totalCount,
        hasMore: offset + limit < totalCount
      }
    })

  } catch (error: any) {
    console.error("Get timeline error:", error)
    return NextResponse.json(
      { error: "Failed to get timeline", message: error.message },
      { status: 500 }
    )
  }
}
