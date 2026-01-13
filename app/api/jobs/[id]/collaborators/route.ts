/**
 * Job Collaborators API Endpoints
 * 
 * GET /api/jobs/[id]/collaborators - List collaborators
 * POST /api/jobs/[id]/collaborators - Add a collaborator
 * DELETE /api/jobs/[id]/collaborators?userId=xxx - Remove a collaborator
 * 
 * Permission Model:
 * - Only owner/admin can manage collaborators
 * - All org members can view collaborators (job is visible by default)
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

    const collaborators = await JobService.getCollaborators(id, organizationId)

    return NextResponse.json({
      success: true,
      collaborators
    })

  } catch (error: any) {
    console.error("Get collaborators error:", error)
    return NextResponse.json(
      { error: "Failed to get collaborators", message: error.message },
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

    const { userId: collaboratorUserId, role } = body

    if (!collaboratorUserId) {
      return NextResponse.json(
        { error: "userId is required" },
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

    // Check permission to manage collaborators
    const canManage = await JobService.canUserAccessJob(userId, userRole, job, 'manage_collaborators')
    if (!canManage) {
      return NextResponse.json(
        { error: "Access denied - only owner or admin can manage collaborators" },
        { status: 403 }
      )
    }

    const collaborator = await JobService.addCollaborator(
      id,
      collaboratorUserId,
      userId,  // addedBy
      organizationId,
      role || "collaborator"
    )

    if (!collaborator) {
      return NextResponse.json(
        { error: "Failed to add collaborator" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      collaborator
    }, { status: 201 })

  } catch (error: any) {
    console.error("Add collaborator error:", error)
    return NextResponse.json(
      { error: "Failed to add collaborator", message: error.message },
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
    
    const collaboratorUserId = searchParams.get("userId")

    if (!collaboratorUserId) {
      return NextResponse.json(
        { error: "userId query parameter is required" },
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

    // Check permission to manage collaborators
    const canManage = await JobService.canUserAccessJob(userId, userRole, job, 'manage_collaborators')
    if (!canManage) {
      return NextResponse.json(
        { error: "Access denied - only owner or admin can manage collaborators" },
        { status: 403 }
      )
    }

    const removed = await JobService.removeCollaborator(id, collaboratorUserId, organizationId)

    if (!removed) {
      return NextResponse.json(
        { error: "Collaborator not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Collaborator removed"
    })

  } catch (error: any) {
    console.error("Remove collaborator error:", error)
    return NextResponse.json(
      { error: "Failed to remove collaborator", message: error.message },
      { status: 500 }
    )
  }
}
