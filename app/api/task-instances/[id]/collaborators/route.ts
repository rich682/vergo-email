import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
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

    const organizationId = session.user.organizationId
    const { id: taskInstanceId } = await params

    const collaborators = await TaskInstanceService.getCollaborators(taskInstanceId, organizationId)

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: taskInstanceId } = await params
    const body = await request.json()

    const { userId: collaboratorUserId, role } = body

    if (!collaboratorUserId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canManage = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'manage_collaborators')
    if (!canManage) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const collaborator = await TaskInstanceService.addCollaborator(
      taskInstanceId,
      collaboratorUserId,
      userId,
      organizationId,
      role || "collaborator"
    )

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER
    const { id: taskInstanceId } = await params
    const { searchParams } = new URL(request.url)
    
    const collaboratorUserId = searchParams.get("userId")

    if (!collaboratorUserId) {
      return NextResponse.json({ error: "userId query parameter is required" }, { status: 400 })
    }

    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const canManage = await TaskInstanceService.canUserAccess(userId, userRole, instance, 'manage_collaborators')
    if (!canManage) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const removed = await TaskInstanceService.removeCollaborator(taskInstanceId, collaboratorUserId, organizationId)

    if (!removed) {
      return NextResponse.json({ error: "Collaborator not found" }, { status: 404 })
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
