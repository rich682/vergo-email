/**
 * Manual Form Reminder API Endpoint
 * 
 * POST /api/forms/[requestId]/remind - Manually send a reminder for a pending form
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { FormNotificationService } from "@/lib/services/form-notification.service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { requestId } = await params

    // Get the form request
    const formRequest = await prisma.formRequest.findFirst({
      where: {
        id: requestId,
        organizationId: session.user.organizationId,
      },
      include: {
        recipientUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        formDefinition: {
          select: {
            name: true,
          },
        },
        taskInstance: {
          select: {
            name: true,
            owner: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }

    if (formRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Can only send reminders for pending forms" },
        { status: 400 }
      )
    }

    if (formRequest.remindersSent >= formRequest.remindersMaxCount) {
      return NextResponse.json(
        { error: "Maximum reminders already sent" },
        { status: 400 }
      )
    }

    const reminderNumber = formRequest.remindersSent + 1

    // Send the reminder
    const success = await FormNotificationService.sendFormReminderEmail({
      formRequestId: formRequest.id,
      recipientEmail: formRequest.recipientUser.email,
      recipientName: formRequest.recipientUser.name,
      formName: formRequest.formDefinition.name,
      taskName: formRequest.taskInstance.name,
      senderName: formRequest.taskInstance.owner?.name || session.user.name || null,
      senderEmail: formRequest.taskInstance.owner?.email || session.user.email || "",
      deadlineDate: formRequest.deadlineDate,
      boardPeriod: null,
      reminderNumber,
      maxReminders: formRequest.remindersMaxCount,
      organizationId: formRequest.organizationId,
    })

    if (!success) {
      return NextResponse.json(
        { error: "Failed to send reminder email" },
        { status: 500 }
      )
    }

    // Update reminder count
    const newSentCount = formRequest.remindersSent + 1
    const shouldContinue = newSentCount < formRequest.remindersMaxCount
    const nextReminderAt = shouldContinue
      ? new Date(Date.now() + formRequest.reminderFrequencyHours * 60 * 60 * 1000)
      : null

    await prisma.formRequest.update({
      where: { id: requestId },
      data: {
        remindersSent: newSentCount,
        nextReminderAt,
      },
    })

    return NextResponse.json({
      success: true,
      reminderNumber,
      remindersSent: newSentCount,
    })
  } catch (error: any) {
    console.error("Error sending manual reminder:", error)
    return NextResponse.json(
      { error: "Failed to send reminder", message: error.message },
      { status: 500 }
    )
  }
}
