import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { canPerformAction, hasModuleAccess } from "@/lib/permissions"
import { UserRole } from "@prisma/client"

// Constants for pagination and performance
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_CONTENT_PREVIEW_LENGTH = 200

/**
 * Normalized timeline event shape.
 * Supports both legacy event types (from live data) and new types (from ActivityEvent).
 */
interface TimelineEvent {
  id: string
  type:
    // Legacy types (from live data + ActivityEvent)
    | "comment"
    | "email_sent"
    | "email_reply"
    | "reminder_sent"
    // New types (from ActivityEvent only)
    | "status_change"
    | "field_edit"
    | "collaborator_added"
    | "collaborator_removed"
    | "form_sent"
    | "form_submitted"
    | "attachment_uploaded"
    | "label_created"
    | "evidence_reviewed"
    | "task_archived"
    | "auto_in_progress"
    | "email_bounced"
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
  metadata?: Record<string, unknown>
}

/**
 * Map ActivityEvent.eventType to TimelineEvent.type
 */
function mapEventTypeToTimelineType(
  eventType: string
): TimelineEvent["type"] | null {
  const mapping: Record<string, TimelineEvent["type"]> = {
    // Task lifecycle
    "task.status_changed": "status_change",
    "task.archived": "task_archived",
    "task.deleted": "task_archived",
    "task.completed": "status_change",
    "task.auto_in_progress": "auto_in_progress",
    "task.snapshot_created": "status_change",
    // Field edits
    "task.name_changed": "field_edit",
    "task.description_changed": "field_edit",
    "task.due_date_changed": "field_edit",
    "task.owner_changed": "field_edit",
    "task.notes_changed": "field_edit",
    "task.custom_fields_changed": "field_edit",
    "task.labels_changed": "field_edit",
    "task.client_changed": "field_edit",
    "task.type_changed": "field_edit",
    "task.report_config_changed": "field_edit",
    "task.recon_config_changed": "field_edit",
    // Collaborators
    "collaborator.added": "collaborator_added",
    "collaborator.removed": "collaborator_removed",
    // Comments (from ActivityEvent — deduplicate with live data)
    "comment.added": "comment",
    "comment.deleted": "comment",
    // Attachments
    "attachment.uploaded": "attachment_uploaded",
    // Email
    "email.sent": "email_sent",
    "email.reply_received": "email_reply",
    "email.bounced": "email_bounced",
    // Reminders
    "reminder.sent": "reminder_sent",
    // Forms
    "form.request_sent": "form_sent",
    "form.submitted": "form_submitted",
    // Labels
    "label.created": "label_created",
    // Evidence
    "evidence.approved": "evidence_reviewed",
    "evidence.rejected": "evidence_reviewed",
    "evidence.reset": "evidence_reviewed",
    "evidence.deleted": "evidence_reviewed",
  }
  return mapping[eventType] || null
}

/**
 * Determine which filter categories an event type belongs to
 */
function matchesFilter(
  type: TimelineEvent["type"],
  filter: string | null
): boolean {
  if (!filter || filter === "all") return true
  switch (filter) {
    case "emails":
      return [
        "email_sent",
        "email_reply",
        "email_bounced",
        "reminder_sent",
      ].includes(type)
    case "comments":
      return type === "comment"
    case "changes":
      return [
        "status_change",
        "field_edit",
        "collaborator_added",
        "collaborator_removed",
        "form_sent",
        "form_submitted",
        "attachment_uploaded",
        "label_created",
        "evidence_reviewed",
        "task_archived",
        "auto_in_progress",
      ].includes(type)
    default:
      return true
  }
}

/**
 * Check if an event type requires request/module access
 */
function requiresRequestAccess(type: TimelineEvent["type"]): boolean {
  return [
    "email_sent",
    "email_reply",
    "email_bounced",
    "reminder_sent",
    "form_sent",
    "form_submitted",
  ].includes(type)
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
    const userRole = session.user.role || UserRole.MEMBER
    const orgActionPermissions = session.user.orgActionPermissions || null
    const { id: taskInstanceId } = await params
    const { searchParams } = new URL(request.url)

    let limit = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10)
    if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT
    if (limit > MAX_LIMIT) limit = MAX_LIMIT

    let offset = parseInt(searchParams.get("offset") || "0", 10)
    if (isNaN(offset) || offset < 0) offset = 0

    const filter = searchParams.get("filter") as
      | "all"
      | "emails"
      | "comments"
      | "changes"
      | null

    // Verify task instance exists
    const instance = await TaskInstanceService.findById(
      taskInstanceId,
      organizationId
    )
    if (!instance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await TaskInstanceService.canUserAccess(
      userId,
      userRole,
      instance,
      "view",
      orgActionPermissions
    )
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Determine if user is directly involved (owner/collaborator)
    let isDirectlyInvolved =
      userRole === UserRole.ADMIN || instance.ownerId === userId
    if (!isDirectlyInvolved) {
      const isTaskCollaborator =
        await prisma.taskInstanceCollaborator.findUnique({
          where: {
            taskInstanceId_userId: { taskInstanceId, userId },
          },
        })
      if (isTaskCollaborator) {
        isDirectlyInvolved = true
      } else if (instance.boardId) {
        const isBoardCollaborator =
          await prisma.boardCollaborator.findUnique({
            where: {
              boardId_userId: { boardId: instance.boardId, userId },
            },
          })
        if (isBoardCollaborator) isDirectlyInvolved = true
      }
    }

    const canSeeRequestEvents =
      isDirectlyInvolved ||
      hasModuleAccess(userRole, "inbox", orgActionPermissions) ||
      hasModuleAccess(userRole, "requests", orgActionPermissions)

    const events: TimelineEvent[] = []

    // ─── 1. Fetch from ActivityEvent table (new events) ───────────────
    // Build eventType filter for the ActivityEvent query
    const activityEvents = await prisma.activityEvent.findMany({
      where: {
        taskInstanceId,
        organizationId,
      },
      orderBy: { createdAt: "desc" },
      take: (limit + offset) * 2, // Fetch extra for dedup + filtering
    })

    // Pre-fetch actor details for activity events
    const actorIds = [
      ...new Set(
        activityEvents
          .filter((ae) => ae.actorId)
          .map((ae) => ae.actorId!)
      ),
    ]
    const actors =
      actorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, email: true },
          })
        : []
    const actorMap = new Map(actors.map((a) => [a.id, a]))

    // Track which live-data events have corresponding ActivityEvent records
    // to avoid duplicates (comments and emails may exist in both)
    const activityCommentTargetIds = new Set<string>()
    const activityMessageTargetIds = new Set<string>()
    const activityReminderEventTypes = new Set<string>()

    activityEvents.forEach((ae) => {
      const mappedType = mapEventTypeToTimelineType(ae.eventType)
      if (!mappedType) return

      // Track for deduplication
      if (
        ae.eventType === "comment.added" &&
        ae.targetId
      ) {
        activityCommentTargetIds.add(ae.targetId)
      }
      if (
        (ae.eventType === "email.sent" ||
          ae.eventType === "email.reply_received" ||
          ae.eventType === "email.bounced") &&
        ae.targetId
      ) {
        activityMessageTargetIds.add(ae.targetId)
      }
      if (ae.eventType === "reminder.sent") {
        // Track by requestId + timestamp for dedup
        activityReminderEventTypes.add(
          `${ae.requestId}-${ae.createdAt.toISOString()}`
        )
      }

      const author = ae.actorId ? actorMap.get(ae.actorId) : undefined
      const metadata = ae.metadata as Record<string, unknown> | null

      events.push({
        id: `activity-${ae.id}`,
        type: mappedType,
        timestamp: ae.createdAt.toISOString(),
        content: ae.summary,
        author: author
          ? { id: author.id, name: author.name, email: author.email }
          : undefined,
        taskInstanceId,
        requestId: ae.requestId || undefined,
        requestName: (metadata?.requestName as string) || undefined,
        recipientName: (metadata?.recipientName as string) || undefined,
        recipientEmail: (metadata?.recipientEmail as string) || undefined,
        metadata: metadata || undefined,
      })
    })

    // ─── 2. Fetch from live data (legacy fallback for historical events) ──

    // Fetch Comments (always visible if you can see the task)
    if (filter !== "emails" && filter !== "changes") {
      const comments = await prisma.taskInstanceComment.findMany({
        where: {
          taskInstanceId,
          taskInstance: { organizationId },
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit + offset,
        skip: 0,
      })

      comments.forEach((comment) => {
        // Skip if already covered by an ActivityEvent record
        if (activityCommentTargetIds.has(comment.id)) return

        events.push({
          id: `comment-${comment.id}`,
          type: "comment",
          timestamp: comment.createdAt.toISOString(),
          content:
            comment.content.length > MAX_CONTENT_PREVIEW_LENGTH
              ? comment.content.substring(0, MAX_CONTENT_PREVIEW_LENGTH) +
                "..."
              : comment.content,
          author: comment.author,
          taskInstanceId,
        })
      })
    }

    // Fetch Messages and Reminders (skip entirely if user can't see request events)
    if (
      filter !== "comments" &&
      filter !== "changes" &&
      canSeeRequestEvents
    ) {
      const requests = await prisma.request.findMany({
        where: {
          taskInstanceId,
          organizationId,
        },
        select: {
          id: true,
          campaignName: true,
          entity: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      })

      const requestIds = requests.map((r) => r.id)
      const requestMap = new Map(requests.map((r) => [r.id, r]))

      if (requestIds.length > 0) {
        const messages = await prisma.message.findMany({
          where: {
            requestId: { in: requestIds },
          },
          select: {
            id: true,
            requestId: true,
            direction: true,
            subject: true,
            createdAt: true,
            fromAddress: true,
          },
          orderBy: { createdAt: "desc" },
          take: (limit + offset) * 2,
        })

        messages.forEach((message) => {
          // Skip if already covered by an ActivityEvent record
          if (activityMessageTargetIds.has(message.id)) return

          const req = requestMap.get(message.requestId)
          const recipientName = req?.entity
            ? `${req.entity.firstName} ${req.entity.lastName || ""}`.trim()
            : undefined
          const recipientEmail = req?.entity?.email || undefined

          const content = message.subject
            ? message.subject.length > MAX_CONTENT_PREVIEW_LENGTH
              ? message.subject.substring(0, MAX_CONTENT_PREVIEW_LENGTH) +
                "..."
              : message.subject
            : message.direction === "INBOUND"
              ? "Reply received"
              : "Email sent"

          events.push({
            id: `message-${message.id}`,
            type:
              message.direction === "INBOUND"
                ? "email_reply"
                : "email_sent",
            timestamp: message.createdAt.toISOString(),
            content,
            taskInstanceId,
            requestId: message.requestId,
            requestName: req?.campaignName || undefined,
            recipientName,
            recipientEmail,
          })
        })

        const reminders = await prisma.reminderState.findMany({
          where: {
            requestId: { in: requestIds },
            sentCount: { gt: 0 },
            lastSentAt: { not: null },
          },
          select: {
            id: true,
            requestId: true,
            sentCount: true,
            lastSentAt: true,
          },
          orderBy: { lastSentAt: "desc" },
          take: limit + offset,
        })

        reminders.forEach((reminder) => {
          if (!reminder.lastSentAt) return

          // Skip if already covered by ActivityEvent
          const dedupKey = `${reminder.requestId}-${reminder.lastSentAt.toISOString()}`
          if (activityReminderEventTypes.has(dedupKey)) return

          const req = requestMap.get(reminder.requestId)
          const recipientName = req?.entity
            ? `${req.entity.firstName} ${req.entity.lastName || ""}`.trim()
            : undefined
          const recipientEmail = req?.entity?.email || undefined

          events.push({
            id: `reminder-${reminder.id}`,
            type: "reminder_sent",
            timestamp: reminder.lastSentAt.toISOString(),
            content: `Reminder #${reminder.sentCount} sent`,
            taskInstanceId,
            requestId: reminder.requestId,
            requestName: req?.campaignName || undefined,
            recipientName,
            recipientEmail,
          })
        })
      }
    }

    // ─── 3. Sort, filter, and paginate ────────────────────────────────

    // Sort all events by timestamp descending (stable sort)
    events.sort((a, b) => {
      const timeDiff =
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      if (timeDiff !== 0) return timeDiff
      return a.id.localeCompare(b.id)
    })

    // Filter by requested category
    let filteredEvents = events.filter((e) => matchesFilter(e.type, filter))

    // Filter by module permissions (non-directly-involved users)
    if (!canSeeRequestEvents) {
      filteredEvents = filteredEvents.filter(
        (e) => !requiresRequestAccess(e.type)
      )
    }

    // Apply pagination
    const totalCount = filteredEvents.length
    const paginatedEvents = filteredEvents.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      events: paginatedEvents,
      pagination: {
        offset,
        limit,
        total: totalCount,
        hasMore: offset + limit < totalCount,
      },
    })
  } catch (error: any) {
    console.error("Get timeline error:", error)
    return NextResponse.json(
      { error: "Failed to get timeline" },
      { status: 500 }
    )
  }
}
