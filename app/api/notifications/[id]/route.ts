/**
 * Individual Notification API
 *
 * PATCH /api/notifications/[id] - Mark a specific notification as read
 *
 * Authorization: Any authenticated user (own notifications only)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NotificationService } from "@/lib/services/notification.service"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    await NotificationService.markAsRead(id, session.user.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[Notifications] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to mark notification as read" },
      { status: 500 }
    )
  }
}
