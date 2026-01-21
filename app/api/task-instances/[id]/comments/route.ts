import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
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

    const comments = await TaskInstanceService.getComments(id, organizationId, {
      limit,
      offset,
    })

    return NextResponse.json({
      success: true,
      comments,
    })
  } catch (error: any) {
    console.error("List comments error:", error)
    return NextResponse.json(
      { error: "Failed to list comments", message: error.message },
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
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
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

    return NextResponse.json({
      success: true,
      comment,
    }, { status: 201 })
  } catch (error: any) {
    console.error("Create comment error:", error)
    return NextResponse.json(
      { error: "Failed to create comment", message: error.message },
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

    const deleted = await TaskInstanceService.deleteComment(commentId, userId, organizationId)

    if (!deleted) {
      return NextResponse.json({ error: "Comment not found or access denied" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: "Comment deleted",
    })
  } catch (error: any) {
    console.error("Delete comment error:", error)
    return NextResponse.json(
      { error: "Failed to delete comment", message: error.message },
      { status: 500 }
    )
  }
}
