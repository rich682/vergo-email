/**
 * Form Requests API Endpoint
 * 
 * GET /api/task-instances/[id]/form-requests - List form requests for a task
 * POST /api/task-instances/[id]/form-requests - Send form requests to recipients
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { FormRequestService } from "@/lib/services/form-request.service"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { UserRole } from "@prisma/client"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: taskInstanceId } = await params

    // Verify task exists and user has access
    const task = await TaskInstanceService.findById(taskInstanceId, session.user.organizationId)
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const formRequests = await FormRequestService.findByTask(
      taskInstanceId,
      session.user.organizationId
    )

    const progress = await FormRequestService.getProgress(
      taskInstanceId,
      session.user.organizationId
    )

    return NextResponse.json({ formRequests, progress })
  } catch (error: any) {
    console.error("Error fetching form requests:", error)
    return NextResponse.json(
      { error: "Failed to fetch form requests", message: error.message },
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

    const { id: taskInstanceId } = await params
    const userId = session.user.id
    const userRole = (session.user as any).role as UserRole || UserRole.MEMBER

    // Verify task exists and user has edit access
    const task = await TaskInstanceService.findById(taskInstanceId, session.user.organizationId)
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const canEdit = await TaskInstanceService.canUserAccess(userId, userRole, task, "edit")
    if (!canEdit) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await request.json()
    const { formDefinitionId, recipientUserIds, deadlineDate, reminderConfig } = body

    // Validate required fields
    if (!formDefinitionId) {
      return NextResponse.json({ error: "formDefinitionId is required" }, { status: 400 })
    }
    if (!recipientUserIds || !Array.isArray(recipientUserIds) || recipientUserIds.length === 0) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 })
    }

    const result = await FormRequestService.createBulk(
      session.user.organizationId,
      taskInstanceId,
      {
        formDefinitionId,
        recipientUserIds,
        deadlineDate: deadlineDate ? new Date(deadlineDate) : undefined,
        reminderConfig,
      }
    )

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error("Error creating form requests:", error)
    return NextResponse.json(
      { error: "Failed to create form requests", message: error.message },
      { status: 500 }
    )
  }
}
