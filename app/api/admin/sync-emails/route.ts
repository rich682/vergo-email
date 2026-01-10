/**
 * Admin API endpoint to manually sync Gmail accounts for new messages
 * This polls Gmail for new messages as a fallback when push notifications aren't working
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailSyncService } from "@/lib/services/email-sync.service"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    console.log("[Email Sync API] Starting manual email sync...")
    
    const result = await EmailSyncService.syncGmailAccounts()
    
    return NextResponse.json({
      success: true,
      message: "Email sync completed",
      processed: result.processed,
      errors: result.errors
    })
  } catch (error: any) {
    console.error("[Email Sync API] Error syncing emails:", error)
    return NextResponse.json(
      { 
        error: "Email sync failed",
        message: error.message 
      },
      { status: 500 }
    )
  }
}

