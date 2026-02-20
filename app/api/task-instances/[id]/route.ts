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
import { ActivityEventService } from "@/lib/activity-events"
import { prisma } from "@/lib/prisma"
import { JobStatus, UserRole } from "@prisma/client"
import { periodKeyFromDate } from "@/lib/utils/period"
import { canPerformAction } from "@/lib/permissions"

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
    const { id } = await params

    const taskInstance = await TaskInstanceService.findById(id, organizationId)

    if (!taskInstance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // Check view permission
    const canView = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'view', orgActionPermissions)
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Include permission info for UI
    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'edit', orgActionPermissions)
    const canUpdateStatus = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'update_status', orgActionPermissions)
    const canManageCollaborators = await TaskInstanceService.canUserAccess(userId, userRole, taskInstance, 'manage_collaborators', orgActionPermissions)

    const labels = taskInstance.labels as any
    const stakeholders = labels?.stakeholders || []
    const customStatus = labels?.customStatus || null
    const noStakeholdersNeeded = labels?.noStakeholdersNeeded || false

    const effectiveStatus = customStatus || taskInstance.status

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

    const sessionRole = session.user.role as string | undefined

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = sessionRole?.toUpperCase() as UserRole || UserRole.MEMBER
    const orgActionPermissions = session.user.orgActionPermissions || null
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

    const { name, description, clientId, status, dueDate, labels, stakeholders, ownerId, notes, customFields, createLineage, reportDefinitionId, reportFilterBindings, reconciliationConfigId, taskType } = body

    // Determine if this is a status-only update (collaborators can do this)
    const isStatusOnlyUpdate = status && !name && !description && !clientId && !dueDate && !labels && !stakeholders && !ownerId && !notes && !customFields && !createLineage && !reportDefinitionId && !reportFilterBindings && !reconciliationConfigId && !taskType

    if (isStatusOnlyUpdate) {
      // Collaborators can update status
      const canUpdateStatus = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'update_status', orgActionPermissions)
      if (!canUpdateStatus) {
        return NextResponse.json(
          { error: "Access denied - you don't have permission to update this task's status" },
          { status: 403 }
        )
      }
    } else {
      // Non-owners need tasks:edit_any permission
      if (existingInstance.ownerId !== userId) {
        if (!canPerformAction(session.user.role, "tasks:edit_any", session.user.orgActionPermissions)) {
          return NextResponse.json(
            { error: "You do not have permission to edit tasks you don't own" },
            { status: 403 }
          )
        }
      }
      // Full edit requires edit permission
      const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'edit', orgActionPermissions)
      if (!canEdit) {
        return NextResponse.json(
          { error: "Access denied - only owner or admin can edit" },
          { status: 403 }
        )
      }
    }

    // Module-specific permission checks for cross-module linking
    if (reconciliationConfigId !== undefined) {
      if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
        return NextResponse.json(
          { error: "You do not have permission to link reconciliations" },
          { status: 403 }
        )
      }
    }
    if (reportDefinitionId !== undefined) {
      if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
        return NextResponse.json(
          { error: "You do not have permission to configure reports" },
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
      const canManage = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'manage_collaborators', orgActionPermissions)
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

    // Determine completedAt based on status change
    let completedAt: Date | null | undefined = undefined
    if (effectiveStatus) {
      const completedStatuses: string[] = ["COMPLETE", "COMPLETED"]
      const wasCompletedBefore = completedStatuses.includes(existingInstance.status)
      const isCompletedNow = completedStatuses.includes(effectiveStatus)

      if (isCompletedNow && !wasCompletedBefore) {
        completedAt = new Date()
      } else if (!isCompletedNow && wasCompletedBefore) {
        completedAt = null
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
      // Task type for agent integration
      taskType: taskType !== undefined ? taskType : undefined,
      // Completion tracking
      completedAt,
    })

    if (!taskInstance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    // ─── Activity Event Logging (non-blocking) ─────────────────────────
    const actorName = session.user.name || session.user.email || "Someone"

    // Detect field changes by comparing existingInstance to request body
    const fieldChanges: Array<{ field: string; oldValue: unknown; newValue: unknown; displayField?: string }> = []

    if (name !== undefined && name?.trim() !== existingInstance.name) {
      fieldChanges.push({ field: "name", oldValue: existingInstance.name, newValue: name?.trim(), displayField: "name" })
    }
    if (description !== undefined && (description?.trim() || null) !== existingInstance.description) {
      fieldChanges.push({ field: "description", oldValue: existingInstance.description ? "[previous]" : null, newValue: description?.trim() ? "[updated]" : null, displayField: "description" })
    }
    if (ownerId && ownerId !== existingInstance.ownerId) {
      fieldChanges.push({ field: "owner", oldValue: existingInstance.ownerId, newValue: ownerId, displayField: "owner" })
    }
    if (dueDate !== undefined) {
      const oldDue = existingInstance.dueDate?.toISOString() || null
      const newDue = dueDate ? new Date(dueDate).toISOString() : null
      if (oldDue !== newDue) {
        fieldChanges.push({ field: "due_date", oldValue: oldDue, newValue: newDue, displayField: "due date" })
      }
    }
    if (notes !== undefined && notes !== existingInstance.notes) {
      fieldChanges.push({ field: "notes", oldValue: existingInstance.notes ? "[previous]" : null, newValue: notes ? "[updated]" : null, displayField: "notes" })
    }
    if (clientId !== undefined && clientId !== (existingInstance as any).clientId) {
      fieldChanges.push({ field: "client", oldValue: (existingInstance as any).clientId, newValue: clientId, displayField: "client" })
    }
    if (taskType !== undefined && taskType !== (existingInstance as any).taskType) {
      fieldChanges.push({ field: "type", oldValue: (existingInstance as any).taskType, newValue: taskType, displayField: "task type" })
    }
    if (reportDefinitionId !== undefined && reportDefinitionId !== existingInstance.reportDefinitionId) {
      fieldChanges.push({ field: "report_config", oldValue: existingInstance.reportDefinitionId, newValue: reportDefinitionId, displayField: "report configuration" })
    }
    if (reconciliationConfigId !== undefined && reconciliationConfigId !== (existingInstance as any).reconciliationConfigId) {
      fieldChanges.push({ field: "recon_config", oldValue: (existingInstance as any).reconciliationConfigId, newValue: reconciliationConfigId, displayField: "reconciliation configuration" })
    }

    if (fieldChanges.length > 0) {
      ActivityEventService.logFieldChanges({
        organizationId,
        taskInstanceId: id,
        actorId: userId,
        actorName,
        changes: fieldChanges,
        boardId: taskInstance.boardId || undefined,
      })
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

    // Send status change notifications + activity event (non-blocking)
    if (status && status !== existingInstance.status) {
      const statusActorName = session.user.name || "Someone"
      const taskName = existingInstance.name || "a task"
      const displayStatus = customStatus || status
      NotificationService.notifyTaskParticipants(
        id,
        organizationId,
        userId,
        "status_change",
        `${statusActorName} changed status of "${taskName}"`,
        `Status changed to ${displayStatus}`,
        { oldStatus: existingInstance.status, newStatus: displayStatus }
      ).catch((err) => console.error("Failed to send status change notifications:", err))

      // Log activity event for status change
      ActivityEventService.logStatusChange({
        organizationId,
        taskInstanceId: id,
        actorId: userId,
        actorName: statusActorName,
        oldStatus: existingInstance.status,
        newStatus: effectiveStatus || status,
        customStatus,
        boardId: taskInstance.boardId || undefined,
      })
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

    const sessionRole = session.user.role as string | undefined

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = sessionRole?.toUpperCase() as UserRole || UserRole.MEMBER
    const orgActionPermissions = session.user.orgActionPermissions || null
    const { id } = await params
    const { searchParams } = new URL(request.url)
    
    const hard = searchParams.get("hard") === "true"

    if (!canPerformAction(session.user.role, "tasks:delete", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to delete tasks" }, { status: 403 })
    }

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
    const canArchive = await TaskInstanceService.canUserAccess(userId, userRole, existingInstance, 'archive', orgActionPermissions)
    if (!canArchive) {
      return NextResponse.json(
        { error: "Access denied - only owner or admin can archive/delete" },
        { status: 403 }
      )
    }

    const boardId = existingInstance.boardId
    const existingAny = existingInstance as any

    // In simplified mode, remove task from future monthly boards before deleting
    if (boardId && existingAny.lineageId) {
      try {
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { features: true },
        })
        const orgFeatures = (org?.features as Record<string, any>) || {}
        if (!orgFeatures.advancedBoardTypes) {
          await BoardService.removeTaskFromFutureBoards(
            existingAny.lineageId,
            boardId,
            organizationId
          )
        }
      } catch (propagateError) {
        console.error("[TaskInstances] Error removing task from future boards:", propagateError)
      }
    }

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

    // Log activity event for archive/delete (non-blocking)
    ActivityEventService.log({
      organizationId,
      taskInstanceId: hard ? undefined : id, // Don't reference deleted tasks
      boardId: boardId || undefined,
      eventType: hard ? "task.deleted" : "task.archived",
      actorId: userId,
      actorType: "user",
      summary: `${session.user.name || "Someone"} ${hard ? "permanently deleted" : "archived"} "${existingInstance.name || "a task"}"`,
      metadata: {
        taskName: existingInstance.name,
        previousStatus: existingInstance.status,
        hard,
      },
    }).catch((err) => console.error("[ActivityEvent] task archive/delete failed:", err))

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
