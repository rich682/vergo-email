/**
 * Notification Count API
 *
 * GET /api/notifications/count - Get unread notification count
 *
 * Authorization: Any authenticated user
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NotificationService } from "@/lib/services/notification.service"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const unreadCount = await NotificationService.getUnreadCount(
      session.user.id
    )

    return NextResponse.json({ unreadCount })
  } catch (error: any) {
    console.error("[Notifications] Count error:", error)
    return NextResponse.json({ unreadCount: 0 })
  }
}
