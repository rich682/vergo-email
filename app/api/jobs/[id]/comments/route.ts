/**
 * Job Comments API Endpoints
 * 
 * GET /api/jobs/[id]/comments - List comments
 * POST /api/jobs/[id]/comments - Add a comment
 * DELETE /api/jobs/[id]/comments?commentId=xxx - Delete a comment
 * 
 * Permission Model:
 * - Owner, collaborators, and admins can add comments
 * - Only comment author can delete their own comment
 * - All org members can view comments (job is visible by default)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobService } from "@/lib/services/job.service"
import { UserRole } from "@prisma/client"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const { id } = await params
    const { searchParams } = new URL(request.url)
    
    const limit = searchParams.get("limit")
    const offset = searchParams.get("offset")

    const comments = await JobService.getComments(id, organizationId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined
    })

    return NextResponse.json({
      success: true,
      comments
    })

  } catch (error: any) {
    console.error("Get comments error:", error)
    return NextResponse.json(
      { error: "Failed to get comments", message: error.message },
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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id } = await params
    const body = await request.json()

    const { content, mentions } = body

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 }
      )
    }

    // Get job to check permissions
    const job = await JobService.findById(id, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    // Check permission to add comment
    const canComment = await JobService.canUserAccessJob(userId, userRole, job, 'add_comment')
    if (!canComment) {
      return NextResponse.json(
        { error: "Access denied - you don't have permission to comment on this job" },
        { status: 403 }
      )
    }

    const comment = await JobService.addComment(
      id,
      userId,
      content.trim(),
      organizationId,
      mentions
    )

    if (!comment) {
      return NextResponse.json(
        { error: "Failed to add comment" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      comment
    }, { status: 201 })

  } catch (error: any) {
    console.error("Add comment error:", error)
    return NextResponse.json(
      { error: "Failed to add comment", message: error.message },
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
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const { id } = await params
    const { searchParams } = new URL(request.url)
    
    const commentId = searchParams.get("commentId")

    if (!commentId) {
      return NextResponse.json(
        { error: "commentId query parameter is required" },
        { status: 400 }
      )
    }

    // Only author can delete their own comment
    const deleted = await JobService.deleteComment(commentId, userId, organizationId)

    if (!deleted) {
      return NextResponse.json(
        { error: "Comment not found or you don't have permission to delete it" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Comment deleted"
    })

  } catch (error: any) {
    console.error("Delete comment error:", error)
    return NextResponse.json(
      { error: "Failed to delete comment", message: error.message },
      { status: 500 }
    )
  }
}
