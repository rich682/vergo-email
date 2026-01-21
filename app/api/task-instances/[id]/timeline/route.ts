import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { UserRole } from "@prisma/client"

// Constants for pagination and performance
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_CONTENT_PREVIEW_LENGTH = 200

/**
 * Normalized timeline event shape
 */
interface TimelineEvent {
  id: string
  type: "comment" | "email_sent" | "email_reply" | "reminder_sent"
  timestamp: string
  content: string
  author?: { 
    id: string
    name: string | null
    email: string 
  }
  taskInstanceId: string
  requestId?: string
  requestName?: string
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
    const { id: taskInstanceId } = await params
    const { searchParams } = new URL(request.url)
    
    let limit = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10)
    if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT
    if (limit > MAX_LIMIT) limit = MAX_LIMIT
    
    let offset = parseInt(searchParams.get("offset") || "0", 10)
    if (isNaN(offset) || offset < 0) offset = 0
    
    const filter = searchParams.get("filter") as "all" | "emails" | "comments" | null

    // Verify task instance exists
    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    const events: TimelineEvent[] = []

    // Fetch Comments
    if (filter !== "emails") {
      const comments = await prisma.taskInstanceComment.findMany({
        where: { 
          taskInstanceId,
          taskInstance: { organizationId }
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
        take: limit + offset,
        skip: 0
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
          taskInstanceId
        })
      })
    }

    // Fetch Messages and Reminders
    if (filter !== "comments") {
      const requests = await prisma.request.findMany({
        where: { 
          taskInstanceId, 
          organizationId 
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

      const requestIds = requests.map(r => r.id)
      const requestMap = new Map(requests.map(r => [r.id, r]))

      if (requestIds.length > 0) {
        const messages = await prisma.message.findMany({
          where: {
            requestId: { in: requestIds }
          },
          select: {
            id: true,
            requestId: true,
            direction: true,
            subject: true,
            createdAt: true,
            fromAddress: true
          },
          orderBy: { createdAt: "desc" },
          take: (limit + offset) * 2
        })

        messages.forEach(message => {
          const request = requestMap.get(message.requestId)
          const recipientName = request?.entity 
            ? `${request.entity.firstName} ${request.entity.lastName || ""}`.trim()
            : undefined
          const recipientEmail = request?.entity?.email || undefined

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
            taskInstanceId,
            requestId: message.requestId,
            requestName: request?.campaignName || undefined,
            recipientName,
            recipientEmail
          })
        })

        const reminders = await prisma.reminderState.findMany({
          where: {
            requestId: { in: requestIds },
            sentCount: { gt: 0 },
            lastSentAt: { not: null }
          },
          select: {
            id: true,
            requestId: true,
            sentCount: true,
            lastSentAt: true
          },
          orderBy: { lastSentAt: "desc" },
          take: limit + offset
        })

        reminders.forEach(reminder => {
          if (!reminder.lastSentAt) return
          
          const request = requestMap.get(reminder.requestId)
          const recipientName = request?.entity 
            ? `${request.entity.firstName} ${request.entity.lastName || ""}`.trim()
            : undefined
          const recipientEmail = request?.entity?.email || undefined

          events.push({
            id: `reminder-${reminder.id}`,
            type: "reminder_sent",
            timestamp: reminder.lastSentAt.toISOString(),
            content: `Reminder #${reminder.sentCount} sent`,
            taskInstanceId,
            requestId: reminder.requestId,
            requestName: request?.campaignName || undefined,
            recipientName,
            recipientEmail
          })
        })
      }
    }

    // Sort all events by timestamp descending (stable sort)
    events.sort((a, b) => {
      const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      if (timeDiff !== 0) return timeDiff
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
