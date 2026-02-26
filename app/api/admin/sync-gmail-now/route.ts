import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailSyncService } from "@/lib/services/email-sync.service"

export const maxDuration = 60
/**
 * Manual trigger endpoint for Gmail sync (safety valve for production)
 * Authenticated admin-only endpoint to immediately sync Gmail accounts for replies
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
    const result = await EmailSyncService.syncGmailAccounts()

    return NextResponse.json({
      success: true,
      ...result
    })
  } catch (error: any) {
    console.error("[Sync Gmail Now] Error:", error)
    return NextResponse.json(
      { 
        error: "Sync failed",
        message: error.message 
      },
      { status: 500 }
    )
  }
}


