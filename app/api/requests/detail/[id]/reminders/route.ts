import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/requests/detail/[id]/reminders
 * Returns reminder state for a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    // Verify request belongs to org
    const task = await prisma.request.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      },
      select: {
        id: true,
        remindersEnabled: true,
        remindersApproved: true,
        remindersStartDelayHours: true,
        remindersFrequencyHours: true,
        remindersMaxCount: true
      }
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Get reminder state
    const reminderState = await prisma.reminderState.findFirst({
      where: {
        requestId: params.id
      },
      select: {
        id: true,
        reminderNumber: true,
        sentCount: true,
        nextSendAt: true,
        lastSentAt: true,
        stoppedReason: true
      }
    })

    // Calculate remaining reminders
    const maxReminders = task.remindersMaxCount || 0
    const sentCount = reminderState?.sentCount || 0
    const remainingReminders = Math.max(0, maxReminders - sentCount)
    const isFinalReminder = remainingReminders === 1

    return NextResponse.json({
      enabled: task.remindersEnabled || false,
      approved: task.remindersApproved || false,
      config: {
        startDelayHours: task.remindersStartDelayHours,
        frequencyHours: task.remindersFrequencyHours,
        maxCount: task.remindersMaxCount
      },
      state: reminderState ? {
        reminderNumber: reminderState.reminderNumber,
        sentCount: reminderState.sentCount,
        nextSendAt: reminderState.nextSendAt,
        lastSentAt: reminderState.lastSentAt,
        stoppedReason: reminderState.stoppedReason,
        remainingReminders,
        isFinalReminder
      } : null
    })
  } catch (error: any) {
    console.error("Error fetching reminders:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/requests/detail/[id]/reminders
 * Cancel upcoming reminders for a task
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    // Verify request belongs to org
    const task = await prisma.request.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      }
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Cancel reminders by setting stoppedReason
    await prisma.reminderState.updateMany({
      where: {
        requestId: params.id
      },
      data: {
        stoppedReason: "cancelled",
        nextSendAt: null
      }
    })

    // Also disable reminders on the request
    await prisma.request.update({
      where: { id: params.id },
      data: {
        remindersEnabled: false
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error cancelling reminders:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
