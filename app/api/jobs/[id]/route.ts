/**
 * Job Detail API Endpoints
 * 
 * GET /api/jobs/[id] - Get job details
 * PATCH /api/jobs/[id] - Update job
 * DELETE /api/jobs/[id] - Delete/archive job
 * 
 * Permission Model:
 * - All org members can view (visible by default)
 * - Only owner/admin can edit, archive, manage collaborators
 * - Collaborators can execute requests and add comments
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobService } from "@/lib/services/job.service"
import { JobStatus, UserRole } from "@prisma/client"

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
    const { id } = await params

    const job = await JobService.findById(id, organizationId)

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

    // Include permission info for UI
    const canEdit = await JobService.canUserAccessJob(userId, userRole, job, 'edit')
    const canManageCollaborators = await JobService.canUserAccessJob(userId, userRole, job, 'manage_collaborators')

    return NextResponse.json({
      success: true,
      job,
      permissions: {
        canEdit,
        canManageCollaborators,
        isOwner: job.ownerId === userId,
        isAdmin: userRole === UserRole.ADMIN
      }
    })

  } catch (error: any) {
    console.error("Job get error:", error)
    return NextResponse.json(
      { error: "Failed to get job", message: error.message },
      { status: 500 }
    )
  }
}

export async function PATCH(
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

    // First, get the job to check permissions
    const existingJob = await JobService.findById(id, organizationId)
    if (!existingJob) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    // Check edit permission
    const canEdit = await JobService.canUserAccessJob(userId, userRole, existingJob, 'edit')
    if (!canEdit) {
      return NextResponse.json(
        { error: "Access denied - only owner or admin can edit" },
        { status: 403 }
      )
    }

    const { name, description, clientId, status, dueDate, labels, ownerId } = body

    // Validate status if provided
    if (status && !Object.values(JobStatus).includes(status)) {
      return NextResponse.json(
        { error: "Invalid status", validStatuses: Object.values(JobStatus) },
        { status: 400 }
      )
    }

    // Ownership transfer requires special handling
    if (ownerId && ownerId !== existingJob.ownerId) {
      const canManage = await JobService.canUserAccessJob(userId, userRole, existingJob, 'manage_collaborators')
      if (!canManage) {
        return NextResponse.json(
          { error: "Access denied - only owner or admin can transfer ownership" },
          { status: 403 }
        )
      }
    }

    const job = await JobService.update(id, organizationId, {
      name: name?.trim(),
      description: description !== undefined ? description?.trim() || null : undefined,
      clientId: clientId !== undefined ? clientId || null : undefined,
      ownerId: ownerId || undefined,
      status: status || undefined,
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
      labels: labels !== undefined ? labels : undefined
    })

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      job
    })

  } catch (error: any) {
    console.error("Job update error:", error)
    return NextResponse.json(
      { error: "Failed to update job", message: error.message },
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
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id } = await params
    const { searchParams } = new URL(request.url)
    
    const hard = searchParams.get("hard") === "true"

    // Get job to check permissions
    const existingJob = await JobService.findById(id, organizationId)
    if (!existingJob) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    // Check archive permission
    const canArchive = await JobService.canUserAccessJob(userId, userRole, existingJob, 'archive')
    if (!canArchive) {
      return NextResponse.json(
        { error: "Access denied - only owner or admin can archive/delete" },
        { status: 403 }
      )
    }

    const deleted = await JobService.delete(id, organizationId, { hard })

    if (!deleted) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: hard ? "Job permanently deleted" : "Job archived"
    })

  } catch (error: any) {
    console.error("Job delete error:", error)
    return NextResponse.json(
      { error: "Failed to delete job", message: error.message },
      { status: 500 }
    )
  }
}
