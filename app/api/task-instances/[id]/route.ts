/**
 * Job Detail API Endpoints
 * 
 * GET /api/task-instances/[id] - Get job details
 * PATCH /api/task-instances/[id] - Update job
 * DELETE /api/task-instances/[id] - Delete/archive job
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
import { ReportGenerationService } from "@/lib/services/report-generation.service"
import { NotificationService } from "@/lib/services/notification.service"
import { prisma } from "@/lib/prisma"
import { JobStatus, UserRole } from "@prisma/client"
import { isReadOnly } from "@/lib/permissions"
import { periodKeyFromDate } from "@/lib/utils/period"

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
    const canUpdateStatus = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'update_status')
    const canManageCollaborators = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'manage_collaborators')

    const labels = taskInstance.labels as any
    const stakeholders = labels?.stakeholders || []
    const customStatus = labels?.customStatus || null
    const noStakeholdersNeeded = labels?.noStakeholdersNeeded || false

    const effectiveStatus = customStatus || taskInstance.status

    // Fetch org role defaults for client-side module access resolution
    let orgRoleDefaults = null
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { features: true }
      })
      const features = (org?.features as Record<string, any>) || {}
      orgRoleDefaults = features.roleDefaultModuleAccess || null
    } catch (err) {
      // Non-critical, fall back to hardcoded defaults
    }

    return NextResponse.json({
      success: true,
      taskInstance: {
        ...taskInstance,
        status: effectiveStatus,
        stakeholders,
        noStakeholdersNeeded
      },
      permissions: {
        canEdit,
        canUpdateStatus,
        canManageCollaborators,
        isOwner: taskInstance.ownerId === userId,
        isAdmin: userRole === UserRole.ADMIN
      },
      userRole: userRole,
      orgRoleDefaults,
    })

  } catch (error: any) {
    console.error("Job get error:", error)
    return NextResponse.json(
      { error: "Failed to get job" },
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
    const sessionRole = session.user.role as string | undefined
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

    const { name, description, clientId, status, dueDate, labels, stakeholders, ownerId, notes, customFields, createLineage, reportDefinitionId, reportFilterBindings, reconciliationConfigId } = body

    // Determine if this is a status-only update (collaborators can do this)
    const isStatusOnlyUpdate = status && !name && !description && !clientId && !dueDate && !labels && !stakeholders && !ownerId && !notes && !customFields && !createLineage && !reportDefinitionId && !reportFilterBindings && !reconciliationConfigId

    if (isStatusOnlyUpdate) {
      // Collaborators can update status
      const canUpdateStatus = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'update_status')
      if (!canUpdateStatus) {
        return NextResponse.json(
          { error: "Access denied - you don't have permission to update this task's status" },
          { status: 403 }
        )
      }
    } else {
      // Full edit requires edit permission
      const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'edit')
      if (!canEdit) {
        return NextResponse.json(
          { error: "Access denied - only owner or admin can edit" },
          { status: 403 }
        )
      }
    }

    // Handle TaskLineage promotion if requested
    let lineageId = existingInstance.lineageId
    if (createLineage && !lineageId) {
      const lineage = await prisma.taskLineage.create({
        data: {
          organizationId,
          name: name?.trim() || existingInstance.name,
          description: description?.trim() || existingInstance.description,
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
      lineageId: lineageId || undefined,
      // Report configuration
      reportDefinitionId: reportDefinitionId !== undefined ? reportDefinitionId : undefined,
      reportFilterBindings: reportFilterBindings !== undefined ? reportFilterBindings : undefined,
      // Reconciliation configuration
      reconciliationConfigId: reconciliationConfigId !== undefined ? reconciliationConfigId : undefined,
    })

    if (!taskInstance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Generate report when report configuration is set on a REPORTS task
    // This creates/updates a GeneratedReport entry for the current period
    if (reportDefinitionId !== undefined && reportDefinitionId && taskInstance.boardId) {
      try {
        // Get board to determine period
        const board = await prisma.board.findUnique({
          where: { id: taskInstance.boardId },
          select: { id: true, periodStart: true, cadence: true }
        })
        
        if (board?.periodStart) {
          const periodKey = periodKeyFromDate(board.periodStart, (board.cadence as any) || "monthly")
          
          if (periodKey) {
            // Check if a generated report already exists for this task+period
            const existingReport = await (prisma as any).generatedReport.findFirst({
              where: {
                taskInstanceId: id,
                periodKey,
                organizationId
              }
            })

            // Delete existing if it exists (to regenerate with new config)
            if (existingReport) {
              await (prisma as any).generatedReport.delete({
                where: { id: existingReport.id }
              })
            }

            // Generate fresh report
            await ReportGenerationService.generateForPeriod({
              organizationId,
              reportDefinitionId,
              filterBindings: reportFilterBindings || undefined,
              taskInstanceId: id,
              boardId: taskInstance.boardId,
              periodKey,
              generatedBy: userId,
            })
          }
        }
      } catch (error) {
        // Log but don't fail the request if report generation fails
        console.error("Error generating report on config change:", error)
      }
    }

    // Send status change notifications (non-blocking)
    if (status && status !== existingInstance.status) {
      const actorName = session.user.name || "Someone"
      const taskName = existingInstance.name || "a task"
      const displayStatus = customStatus || status
      NotificationService.notifyTaskParticipants(
        id,
        organizationId,
        userId,
        "status_change",
        `${actorName} changed status of "${taskName}"`,
        `Status changed to ${displayStatus}`,
        { oldStatus: existingInstance.status, newStatus: displayStatus }
      ).catch((err) => console.error("Failed to send status change notifications:", err))
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
      { error: "Failed to update job" },
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
    const sessionRole = session.user.role as string | undefined
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
      { error: "Failed to delete job" },
      { status: 500 }
    )
  }
}
