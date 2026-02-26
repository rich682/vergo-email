import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { NotificationService } from "@/lib/services/notification.service"
import { ActivityEventService } from "@/lib/activity-events"
import { UserRole } from "@prisma/client"

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const organizationId = session.user.organizationId
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0

    const comments = await TaskInstanceService.getComments(id, organizationId)

    return NextResponse.json({
      success: true,
      comments,
    })
  } catch (error: any) {
    console.error("List comments error:", error)
    return NextResponse.json(
      { error: "Failed to list comments" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role || UserRole.MEMBER
    const body = await request.json()
    const { content, mentions } = body

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 }
      )
    }

    const instance = await TaskInstanceService.findById(id, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canComment = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'add_comment')
    if (!canComment) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const comment = await TaskInstanceService.addComment(id, userId, content.trim(), organizationId, mentions)

    // Auto-transition task instance to IN_PROGRESS when a comment is added
    // Skip for report, analysis, and reconciliation task types (these require more explicit activity)
    const skipAutoTransitionTypes = ["report", "analysis", "reconciliation"]
    if (!skipAutoTransitionTypes.includes(instance.taskType || "")) {
      try {
        await TaskInstanceService.markInProgressIfNotStarted(id, organizationId)
      } catch (err: any) {
        console.error("[Comments] Failed to auto-transition task to IN_PROGRESS:", err.message)
      }
    }

    // Send notifications to task participants (non-blocking)
    const actorName = session.user.name || "Someone"
    const taskName = instance.name || "a task"
    const commentPreview = content.trim().length > 100 ? content.trim().substring(0, 100) + "..." : content.trim()
    const mentionedIds = Array.isArray(mentions) ? mentions.filter((m: string) => m !== userId) : []

    if (mentionedIds.length > 0) {
      // Send "mention" notifications to mentioned users
      NotificationService.createMany(
        mentionedIds.map((mentionedUserId: string) => ({
          userId: mentionedUserId,
          organizationId,
          type: "mention" as const,
          title: `${actorName} mentioned you in "${taskName}"`,
          body: commentPreview,
          taskInstanceId: id,
          actorId: userId,
          metadata: { commentId: comment.id },
        }))
      ).catch((err) => console.error("Failed to send mention notifications:", err))

      // Send generic "comment" notifications to remaining participants (exclude mentioned users to avoid duplicates)
      NotificationService.notifyTaskParticipants(
        id,
        organizationId,
        userId,
        "comment",
        `${actorName} commented on "${taskName}"`,
        commentPreview,
        { commentId: comment.id },
        mentionedIds
      ).catch((err) => console.error("Failed to send comment notifications:", err))
    } else {
      // No mentions — send generic comment notification to all participants
      NotificationService.notifyTaskParticipants(
        id,
        organizationId,
        userId,
        "comment",
        `${actorName} commented on "${taskName}"`,
        commentPreview,
        { commentId: comment.id }
      ).catch((err) => console.error("Failed to send comment notifications:", err))
    }

    // Log activity event (non-blocking)
    ActivityEventService.log({
      organizationId,
      taskInstanceId: id,
      eventType: "comment.added",
      actorId: userId,
      actorType: "user",
      summary: `${actorName} left a comment`,
      metadata: { commentId: comment.id, preview: commentPreview },
      targetId: comment.id,
      targetType: "comment",
    }).catch((err) => console.error("[ActivityEvent] comment.added failed:", err))

    return NextResponse.json({
      success: true,
      comment,
    }, { status: 201 })
  } catch (error: any) {
    console.error("Create comment error:", error)
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get("commentId")
    const userId = session.user.id
    const organizationId = session.user.organizationId

    if (!commentId) {
      return NextResponse.json({ error: "commentId is required" }, { status: 400 })
    }

    const { id: taskInstanceId } = await params
    const deleted = await TaskInstanceService.deleteComment(commentId, userId, organizationId)

    if (!deleted) {
      return NextResponse.json({ error: "Comment not found or access denied" }, { status: 404 })
    }

    // Log activity event (non-blocking)
    ActivityEventService.log({
      organizationId,
      taskInstanceId,
      eventType: "comment.deleted",
      actorId: userId,
      actorType: "user",
      summary: `${session.user.name || "Someone"} deleted a comment`,
      metadata: { commentId },
      targetId: commentId,
      targetType: "comment",
    }).catch((err) => console.error("[ActivityEvent] comment.deleted failed:", err))

    return NextResponse.json({
      success: true,
      message: "Comment deleted",
    })
  } catch (error: any) {
    console.error("Delete comment error:", error)
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    )
  }
}
