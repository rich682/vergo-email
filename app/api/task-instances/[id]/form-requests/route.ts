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
import { ActivityEventService } from "@/lib/activity-events"
import { prisma } from "@/lib/prisma"
import { resolveDatabaseRecipients } from "@/lib/services/database-recipient.service"
import { EmailConnectionService } from "@/lib/services/email-connection.service"

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

      // Check if user is a collaborator on this task
      const isCollaborator = await prisma.taskInstanceCollaborator.findFirst({
        where: { taskInstanceId, userId: session.user.id },
        select: { id: true },
      })

      filteredFormRequests = formRequests.filter((fr: any) => {
        // Direct recipient match
        if (fr.recipientUserId === session.user.id) return true
        // Form definition viewer
        if (viewableFormIds.has(fr.formDefinitionId)) return true
        // Universal link submissions: check if user selected themselves in a "users" field
        if (fr.responseData && fr.formDefinition?.fields) {
          const fields = typeof fr.formDefinition.fields === "string"
            ? JSON.parse(fr.formDefinition.fields)
            : fr.formDefinition.fields
          for (const field of fields) {
            if (field.type === "users" && fr.responseData[field.key]) {
              const val = fr.responseData[field.key]
              if (val === session.user.id) return true
              if (Array.isArray(val) && val.includes(session.user.id)) return true
            }
          }
        }
        return false
      })

      if (filteredFormRequests.length < formRequests.length) {
        viewerRestricted = true
      }
    }

    // Collect all user IDs referenced in "users" type fields in responseData
    // so the frontend can display names instead of raw IDs
    const allUserIds = new Set<string>()
    for (const fr of filteredFormRequests as any[]) {
      if (!fr.responseData || !fr.formDefinition?.fields) continue
      const fields = typeof fr.formDefinition.fields === "string"
        ? JSON.parse(fr.formDefinition.fields)
        : fr.formDefinition.fields
      for (const field of fields) {
        if (field.type === "users" && fr.responseData[field.key]) {
          const val = fr.responseData[field.key]
          if (typeof val === "string") allUserIds.add(val)
          else if (Array.isArray(val)) val.forEach((id: string) => allUserIds.add(id))
        }
      }
    }

    // Resolve user IDs to names
    let userMap: Record<string, string> = {}
    if (allUserIds.size > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: [...allUserIds] } },
        select: { id: true, name: true, email: true },
      })
      userMap = Object.fromEntries(users.map(u => [u.id, u.name || u.email]))
    }

    return NextResponse.json({ formRequests: filteredFormRequests, progress, viewerRestricted, userMap })
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

    // Verify org has an active email account for sending
    const emailAccount = await EmailConnectionService.getPrimaryAccount(session.user.organizationId)
      || await EmailConnectionService.getFirstActive(session.user.organizationId)
    if (!emailAccount) {
      return NextResponse.json(
        { error: "No active email account connected. Please connect an email account in Settings before sending form requests." },
        { status: 400 }
      )
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
    const { formDefinitionId, recipientUserIds, recipientEntityIds, recipientSource, deadlineDate, reminderConfig } = body

    // Validate required fields
    if (!formDefinitionId) {
      return NextResponse.json({ error: "formDefinitionId is required" }, { status: 400 })
    }

    // Resolve database recipients if recipientSource is provided
    let resolvedUserIds = recipientUserIds || []
    let resolvedEntityIds = recipientEntityIds || []

    if (recipientSource?.mode === "database" && recipientSource.databaseId && recipientSource.emailColumnKey) {
      try {
        const dbResult = await resolveDatabaseRecipients(
          session.user.organizationId,
          recipientSource.databaseId,
          recipientSource.emailColumnKey,
          recipientSource.nameColumnKey,
          recipientSource.filters || []
        )
        // For database recipients, we need to find or create entities
        // For now, match emails to existing users where possible
        const dbEmails = dbResult.recipients.map(r => r.email)
        if (dbEmails.length > 0) {
          const matchedUsers = await prisma.user.findMany({
            where: {
              organizationId: session.user.organizationId,
              email: { in: dbEmails },
            },
            select: { id: true, email: true },
          })
          const matchedUserIds = matchedUsers.map(u => u.id)
          resolvedUserIds = [...new Set([...resolvedUserIds, ...matchedUserIds])]
        }
      } catch (dbError: any) {
        console.error("[FormRequests] Database recipient resolution failed:", dbError.message)
      }
    }

    const hasUserIds = resolvedUserIds.length > 0
    const hasEntityIds = resolvedEntityIds && Array.isArray(resolvedEntityIds) && resolvedEntityIds.length > 0

    if (!hasUserIds && !hasEntityIds) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 })
    }

    // Use resolved IDs for the rest of the flow
    const recipientUserIdsFinal = resolvedUserIds
    const recipientEntityIdsFinal = resolvedEntityIds

    console.log(`[FormRequests] Creating form requests:`, {
      organizationId: session.user.organizationId,
      taskInstanceId,
      formDefinitionId,
      userCount: recipientUserIdsFinal?.length || 0,
      entityCount: recipientEntityIdsFinal?.length || 0,
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
          recipientUserIds: recipientUserIdsFinal,
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
          recipientEntityIds: recipientEntityIdsFinal,
          deadlineDate: deadlineDate ? new Date(deadlineDate) : undefined,
          reminderConfig,
        }
      )
      allFormRequests.push(...entityResult.formRequests)
      totalCount += entityResult.count
      console.log(`[FormRequests] Created ${entityResult.count} form requests for entities`)
    }
    
    console.log(`[FormRequests] Created ${totalCount} total form requests successfully`)

    // Ensure the task's formDefinitionId is set (needed for universal form link routing)
    if (task.formDefinitionId !== formDefinitionId) {
      await prisma.taskInstance.update({
        where: { id: taskInstanceId },
        data: { formDefinitionId },
      })
    }

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

    // Auto-transition task instance to IN_PROGRESS when form requests are sent
    if (totalCount > 0) {
      try {
        await TaskInstanceService.markInProgressIfNotStarted(taskInstanceId, session.user.organizationId)
      } catch (err: any) {
        console.error("[FormRequests] Failed to auto-transition task to IN_PROGRESS:", err.message)
      }
    }

    // Log activity event (non-blocking)
    if (totalCount > 0) {
      ActivityEventService.log({
        organizationId: session.user.organizationId,
        taskInstanceId,
        eventType: "form.request_sent",
        actorId: session.user.id,
        actorType: "user",
        summary: `${session.user.name || "Someone"} sent ${totalCount} form request(s)`,
        metadata: { formDefinitionId, recipientCount: totalCount },
      }).catch((err) => console.error("[ActivityEvent] form.request_sent failed:", err))
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
