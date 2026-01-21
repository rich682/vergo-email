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
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { BoardService } from "@/lib/services/board.service"
import { JobStatus, UserRole } from "@prisma/client"
import { isReadOnly } from "@/lib/permissions"

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

    const taskInstance = await TaskInstanceService.findById(id, organizationId)

    if (!taskInstance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Include permission info for UI
    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'edit')
    const canManageCollaborators = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'manage_collaborators')

    const labels = taskInstance.labels as any
    const stakeholders = labels?.stakeholders || []
    const customStatus = labels?.customStatus || null
    const noStakeholdersNeeded = labels?.noStakeholdersNeeded || false
    
    const effectiveStatus = customStatus || taskInstance.status

    // Check for prior snapshot if TABLE task and in a recurring board
    let priorSnapshotExists = false
    if (taskInstance.type === 'TABLE' && taskInstance.lineageId && taskInstance.board?.periodStart) {
      const prior = await prisma.taskInstance.findFirst({
        where: {
          lineageId: taskInstance.lineageId,
          organizationId,
          isSnapshot: true,
          board: {
            periodStart: { lt: taskInstance.board.periodStart }
          }
        }
      })
      priorSnapshotExists = !!prior
    }

    return NextResponse.json({
      success: true,
      taskInstance: {
        ...taskInstance,
        status: effectiveStatus,
        stakeholders,
        noStakeholdersNeeded,
        priorSnapshotExists
      },
      permissions: {
        canEdit,
        canManageCollaborators,
        isOwner: taskInstance.ownerId === userId,
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

    // VIEWER users cannot modify jobs
    const sessionRole = (session.user as any).role as string | undefined
    if (isReadOnly(sessionRole)) {
      return NextResponse.json(
        { error: "Forbidden - Viewers cannot modify tasks" },
        { status: 403 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = sessionRole?.toUpperCase() as UserRole || UserRole.MEMBER
    const { id } = await params
    const body = await request.json()

    // First, get the task instance to check permissions
    const existingInstance = await TaskInstanceService.findById(id, organizationId)
    if (!existingInstance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Check edit permission
    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'edit')
    if (!canEdit) {
      return NextResponse.json(
        { error: "Access denied - only owner or admin can edit" },
        { status: 403 }
      )
    }

    const { name, description, clientId, status, dueDate, labels, stakeholders, ownerId, notes, customFields, type, createLineage } = body

    // 1. Handle TaskLineage promotion if requested
    let lineageId = existingInstance.lineageId
    if (createLineage && !lineageId) {
      const lineage = await prisma.taskLineage.create({
        data: {
          organizationId,
          name: name?.trim() || existingInstance.name,
          description: description?.trim() || existingInstance.description,
          type: type || existingInstance.type,
          config: {}
        }
      })
      lineageId = lineage.id
    }

    // Handle status
    let effectiveStatus = status
    let customStatus: string | null = null
    
    if (status) {
      if (Object.values(JobStatus).includes(status)) {
        effectiveStatus = status
        customStatus = null
      } else {
        effectiveStatus = JobStatus.IN_PROGRESS
        customStatus = status
      }
    }

    // Ownership transfer
    if (ownerId && ownerId !== existingInstance.ownerId) {
      const canManage = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'manage_collaborators')
      if (!canManage) {
        return NextResponse.json(
          { error: "Access denied - only owner or admin can transfer ownership" },
          { status: 403 }
        )
      }
    }

    // Merge stakeholders and customStatus into labels if provided
    let updatedLabels = labels || existingInstance.labels || {}
    if (stakeholders !== undefined) {
      updatedLabels = {
        ...updatedLabels,
        stakeholders
      }
    }
    if (customStatus !== null) {
      updatedLabels = {
        ...updatedLabels,
        customStatus
      }
    } else if (status && Object.values(JobStatus).includes(status)) {
      updatedLabels = {
        ...updatedLabels,
        customStatus: null
      }
    }

    const taskInstance = await TaskInstanceService.update(id, organizationId, {
      name: name?.trim(),
      description: description !== undefined ? description?.trim() || null : undefined,
      clientId: clientId !== undefined ? clientId || null : undefined,
      ownerId: ownerId || undefined,
      status: effectiveStatus || undefined,
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
      labels: updatedLabels,
      notes: notes !== undefined ? notes : undefined,
      customFields: customFields !== undefined ? customFields : undefined,
      type: type || undefined,
      lineageId: lineageId || undefined
    })

    if (!taskInstance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Sync board status if task instance has a board and status was changed
    let boardStatusUpdate = null
    if (taskInstance.boardId && status !== undefined) {
      try {
        boardStatusUpdate = await BoardService.syncStatus(taskInstance.boardId, organizationId)
      } catch (err) {
        console.error("Error syncing board status:", err)
      }
    }

    return NextResponse.json({
      success: true,
      taskInstance,
      boardStatusUpdate: boardStatusUpdate ? {
        boardId: taskInstance.boardId,
        newStatus: boardStatusUpdate.board.status,
        previousStatus: boardStatusUpdate.previousStatus
      } : null
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

    // VIEWER users cannot delete/archive jobs
    const sessionRole = (session.user as any).role as string | undefined
    if (isReadOnly(sessionRole)) {
      return NextResponse.json(
        { error: "Forbidden - Viewers cannot delete tasks" },
        { status: 403 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = sessionRole?.toUpperCase() as UserRole || UserRole.MEMBER
    const { id } = await params
    const { searchParams } = new URL(request.url)
    
    const hard = searchParams.get("hard") === "true"

    // SAFETY: Hard delete is restricted to ADMIN users only
    if (hard && userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Access denied - only administrators can permanently delete task instances" },
        { status: 403 }
      )
    }

    // Get task instance to check permissions
    const existingInstance = await TaskInstanceService.findById(id, organizationId)
    if (!existingInstance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Check archive permission
    const canArchive = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'archive')
    if (!canArchive) {
      return NextResponse.json(
        { error: "Access denied - only owner or admin can archive/delete" },
        { status: 403 }
      )
    }

    const boardId = existingInstance.boardId

    const result = await TaskInstanceService.delete(id, organizationId, { hard })

    if (!result.success) {
      if (result.requestCount && result.requestCount > 0) {
        return NextResponse.json(
          { 
            error: result.error,
            requestCount: result.requestCount,
            code: "HAS_REQUESTS"
          },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: result.error || "Task instance not found" },
        { status: 404 }
      )
    }

    // Sync board status
    let boardStatusUpdate = null
    if (boardId) {
      try {
        boardStatusUpdate = await BoardService.syncStatus(boardId, organizationId)
      } catch (err) {
        console.error("Error syncing board status after task instance delete:", err)
      }
    }

    return NextResponse.json({
      success: true,
      message: hard ? "Task instance permanently deleted" : "Task instance archived",
      requestCount: result.requestCount,
      boardStatusUpdate
    })

  } catch (error: any) {
    console.error("Job delete error:", error)
    return NextResponse.json(
      { error: "Failed to delete job", message: error.message },
      { status: 500 }
    )
  }
}
