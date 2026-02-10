/**
 * Notifications API
 *
 * GET /api/notifications - Get notifications for the current user
 * PATCH /api/notifications - Mark all notifications as read
 *
 * Authorization: Any authenticated user
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NotificationService } from "@/lib/services/notification.service"

/**
 * GET /api/notifications - Get notifications for the current user
 *
 * Query params:
 *   limit: number (default 20)
 *   offset: number (default 0)
 *   unreadOnly: boolean (default false)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "20")
    const offset = parseInt(searchParams.get("offset") || "0")
    const unreadOnly = searchParams.get("unreadOnly") === "true"

    const { notifications, total, unreadCount } =
      await NotificationService.getForUser(session.user.id, {
        limit,
        offset,
        unreadOnly,
      })

    return NextResponse.json({
      success: true,
      notifications,
      total,
      unreadCount,
    })
  } catch (error: any) {
    console.error("[Notifications] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get notifications" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/notifications - Mark all notifications as read
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await NotificationService.markAllAsRead(session.user.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[Notifications] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to mark notifications as read" },
      { status: 500 }
    )
  }
}
