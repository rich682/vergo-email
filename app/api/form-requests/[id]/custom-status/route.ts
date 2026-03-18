/**
 * Custom Status API Endpoint
 *
 * PATCH /api/form-requests/[id]/custom-status - Update the custom/internal status of a form request
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { FormSettings } from "@/lib/types/form"
import { NotificationService } from "@/lib/services/notification.service"
import { FormNotificationService } from "@/lib/services/form-notification.service"
import { ActivityEventService } from "@/lib/activity-events/activity-event.service"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { customStatus } = body

    if (!customStatus || typeof customStatus !== "string") {
      return NextResponse.json(
        { error: "customStatus is required" },
        { status: 400 }
      )
    }

    // Fetch the form request with its form definition settings and recipient info
    const formRequest = await prisma.formRequest.findFirst({
      where: {
        id,
        organizationId: session.user.organizationId,
      },
      include: {
        formDefinition: {
          select: {
            id: true,
            name: true,
            settings: true,
          },
        },
        recipientUser: {
          select: { id: true, name: true, email: true },
        },
        recipientEntity: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        taskInstance: {
          select: { id: true, name: true },
        },
      },
    })

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }

    if (formRequest.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Custom status can only be changed for submitted forms" },
        { status: 400 }
      )
    }

    // Validate the custom status is in the allowed list
    const settings = formRequest.formDefinition.settings as unknown as FormSettings | null
    const allowedStatuses = settings?.customStatuses || ["In Progress", "Submitted"]
    if (!allowedStatuses.includes(customStatus)) {
      return NextResponse.json(
        { error: "Invalid custom status" },
        { status: 400 }
      )
    }

    // Capture old status before updating
    const oldStatus = formRequest.customStatus || "Submitted"

    // Update the custom status
    const updated = await prisma.formRequest.update({
      where: { id },
      data: { customStatus },
    })

    const formName = formRequest.formDefinition.name
    const taskName = formRequest.taskInstance?.name || "a task"

    // Log activity event for review hub (non-blocking)
    ActivityEventService.log({
      organizationId: session.user.organizationId,
      taskInstanceId: formRequest.taskInstanceId,
      formRequestId: id,
      eventType: "form.status_changed",
      actorId: session.user.id,
      actorType: "user",
      summary: `Status changed from "${oldStatus}" to "${customStatus}"`,
      metadata: {
        oldStatus,
        newStatus: customStatus,
        formName,
        contactName: formRequest.recipientUser?.name
          || (formRequest.recipientEntity
            ? `${formRequest.recipientEntity.firstName}${formRequest.recipientEntity.lastName ? ` ${formRequest.recipientEntity.lastName}` : ""}`.trim()
            : null),
        taskName,
      },
    }).catch(err => console.error("Activity event log failed:", err))

    // Send notifications (non-blocking)

    // In-app notification for internal user recipients (skip if self)
    if (formRequest.recipientUser && formRequest.recipientUser.id !== session.user.id) {
      NotificationService.create({
        userId: formRequest.recipientUser.id,
        organizationId: session.user.organizationId,
        type: "status_change",
        title: "Form status updated",
        body: `Status of "${formName}" changed to "${customStatus}"`,
        taskInstanceId: formRequest.taskInstanceId,
        actorId: session.user.id,
        metadata: { formRequestId: id, oldStatus, newStatus: customStatus },
      }).catch(err => console.error("Status change notification failed:", err))
    }

    // Email notification for both internal users and external entities
    const recipientEmail = formRequest.recipientUser?.email || formRequest.recipientEntity?.email
    const recipientName = formRequest.recipientUser?.name
      || (formRequest.recipientEntity
        ? `${formRequest.recipientEntity.firstName}${formRequest.recipientEntity.lastName ? ` ${formRequest.recipientEntity.lastName}` : ""}`.trim()
        : null)

    if (recipientEmail) {
      FormNotificationService.sendStatusChangeEmail({
        formName,
        taskName,
        oldStatus,
        newStatus: customStatus,
        recipientEmail,
        recipientName,
        organizationId: session.user.organizationId,
        accessToken: formRequest.accessToken,
        changerName: session.user.name || null,
      }).catch(err => console.error("Status change email failed:", err))
    }

    return NextResponse.json({
      success: true,
      formRequest: updated,
    })
  } catch (error: any) {
    console.error("Error updating custom status:", error)
    return NextResponse.json(
      { error: "Failed to update custom status" },
      { status: 500 }
    )
  }
}
