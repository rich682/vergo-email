import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runDueRemindersOnce } from "@/lib/services/reminder-runner.service"

/**
 * Dev/admin-only endpoint to manually trigger the reminder/send-due run once.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  if (session.user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  try {
    const result = await runDueRemindersOnce()
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error("[Admin Reminder Run] Error:", error)
    return NextResponse.json(
      { error: "Reminder run failed", message: error?.message },
      { status: 500 }
    )
  }
}
