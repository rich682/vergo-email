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
import { FormNotificationService } from "@/lib/services/form-notification.service"
import { NotificationService } from "@/lib/services/notification.service"
import { UserRole } from "@prisma/client"
import { canPerformAction } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

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

    // Non-admin: filter form requests to only show requests for forms the user is a viewer of,
    // PLUS the user's own form requests (recipients can always see their own)
    const isAdmin = session.user.role === "ADMIN"
    let filteredFormRequests = formRequests
    let viewerRestricted = false

    if (!isAdmin && formRequests.length > 0) {
      // Get unique form definition IDs from the requests
      const formDefIds = [...new Set(formRequests.map((fr: any) => fr.formDefinitionId))]

      // Check which form definitions the user is a viewer of
      const viewerEntries = await prisma.formDefinitionViewer.findMany({
        where: {
          userId: session.user.id,
          formDefinitionId: { in: formDefIds },
        },
        select: { formDefinitionId: true },
      })
      const viewableFormIds = new Set(viewerEntries.map((v) => v.formDefinitionId))

      // Filter: keep requests for viewable forms OR requests where the user is the recipient
      filteredFormRequests = formRequests.filter((fr: any) =>
        viewableFormIds.has(fr.formDefinitionId) || fr.recipientUserId === session.user.id
      )

      if (filteredFormRequests.length < formRequests.length) {
        viewerRestricted = true
      }
    }

    return NextResponse.json({ formRequests: filteredFormRequests, progress, viewerRestricted })
  } catch (error: any) {
    console.error("Error fetching form requests:", error)
    return NextResponse.json(
      { error: "Failed to fetch form requests" },
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

    if (!canPerformAction(session.user.role, "forms:send", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to send form requests" }, { status: 403 })
    }

    const { id: taskInstanceId } = await params
    const userId = session.user.id
    const userRole = session.user.role || UserRole.MEMBER

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
    const { formDefinitionId, recipientUserIds, recipientEntityIds, deadlineDate, reminderConfig } = body

    // Validate required fields
    if (!formDefinitionId) {
      return NextResponse.json({ error: "formDefinitionId is required" }, { status: 400 })
    }
    
    const hasUserIds = recipientUserIds && Array.isArray(recipientUserIds) && recipientUserIds.length > 0
    const hasEntityIds = recipientEntityIds && Array.isArray(recipientEntityIds) && recipientEntityIds.length > 0
    
    if (!hasUserIds && !hasEntityIds) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 })
    }

    console.log(`[FormRequests] Creating form requests:`, {
      organizationId: session.user.organizationId,
      taskInstanceId,
      formDefinitionId,
      userCount: recipientUserIds?.length || 0,
      entityCount: recipientEntityIds?.length || 0,
      deadlineDate,
    })

    // Track all created form requests
    const allFormRequests: any[] = []
    let totalCount = 0

    // Create form requests for internal users
    if (hasUserIds) {
      const userResult = await FormRequestService.createBulk(
        session.user.organizationId,
        taskInstanceId,
        {
          formDefinitionId,
          recipientUserIds,
          deadlineDate: deadlineDate ? new Date(deadlineDate) : undefined,
          reminderConfig,
        }
      )
      allFormRequests.push(...userResult.formRequests)
      totalCount += userResult.count
      console.log(`[FormRequests] Created ${userResult.count} form requests for users`)
    }

    // Create form requests for external entities
    if (hasEntityIds) {
      const entityResult = await FormRequestService.createBulkForEntities(
        session.user.organizationId,
        taskInstanceId,
        {
          formDefinitionId,
          recipientEntityIds,
          deadlineDate: deadlineDate ? new Date(deadlineDate) : undefined,
          reminderConfig,
        }
      )
      allFormRequests.push(...entityResult.formRequests)
      totalCount += entityResult.count
      console.log(`[FormRequests] Created ${entityResult.count} form requests for entities`)
    }
    
    console.log(`[FormRequests] Created ${totalCount} total form requests successfully`)

    // Send email notifications (non-blocking - don't fail the request if emails fail)
    try {
      const formDefinition = await prisma.formDefinition.findFirst({
        where: { id: formDefinitionId, organizationId: session.user.organizationId },
      })
      
      const sender = await prisma.user.findFirst({
        where: { id: session.user.id },
        select: { name: true, email: true },
      })

      // Get board period info
      const boardPeriod = task.board?.periodStart 
        ? new Date(task.board.periodStart).toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : null

      if (formDefinition && allFormRequests.length > 0) {
        // Send emails for user form requests
        const userRequests = allFormRequests.filter(fr => fr.recipientUser)
        if (userRequests.length > 0) {
          const emailResult = await FormNotificationService.sendBulkFormRequestEmails(
            userRequests,
            formDefinition.name,
            task.name,
            sender?.name || null,
            sender?.email || "",
            deadlineDate ? new Date(deadlineDate) : null,
            boardPeriod,
            session.user.organizationId
          )
          console.log(`[FormRequests] Sent ${emailResult.sent} emails to users, ${emailResult.failed} failed`)
        }

        // Send emails for entity form requests
        const entityRequests = allFormRequests.filter(fr => fr.recipientEntity)
        if (entityRequests.length > 0) {
          const emailResult = await FormNotificationService.sendBulkFormRequestEmailsForEntities(
            entityRequests,
            formDefinition.name,
            task.name,
            sender?.name || null,
            sender?.email || "",
            deadlineDate ? new Date(deadlineDate) : null,
            boardPeriod,
            session.user.organizationId
          )
          console.log(`[FormRequests] Sent ${emailResult.sent} emails to entities, ${emailResult.failed} failed`)
        }
      }
    } catch (emailError: any) {
      // Log but don't fail the request - form requests were created successfully
      console.error("[FormRequests] Email sending failed:", emailError.message)
    }

    // Create in-app notifications for internal user recipients (non-blocking)
    try {
      const internalRecipients = allFormRequests.filter(fr => fr.recipientUserId && fr.recipientUserId !== session.user.id)
      if (internalRecipients.length > 0) {
        const formDef = await prisma.formDefinition.findFirst({
          where: { id: formDefinitionId, organizationId: session.user.organizationId },
          select: { name: true },
        })
        const formName = formDef?.name || "a form"

        await NotificationService.createMany(
          internalRecipients.map(fr => ({
            userId: fr.recipientUserId!,
            organizationId: session.user.organizationId,
            type: "form_request" as const,
            title: "New form request",
            body: `You've been asked to fill out "${formName}" for ${task.name}`,
            taskInstanceId,
            actorId: session.user.id,
          }))
        )
        console.log(`[FormRequests] Created ${internalRecipients.length} in-app notifications`)
      }
    } catch (notifError: any) {
      console.error("[FormRequests] In-app notification failed:", notifError.message)
    }

    return NextResponse.json({ count: totalCount, formRequests: allFormRequests }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating form requests:", error.message, error.stack)
    return NextResponse.json(
      { error: "Failed to create form requests" },
      { status: 500 }
    )
  }
}
