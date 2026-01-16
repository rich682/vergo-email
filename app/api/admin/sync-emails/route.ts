/**
 * Admin API endpoint to manually sync email accounts for new messages
 * This polls Gmail and Microsoft for new messages
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
    console.log("[Email Sync API] Starting manual email sync (all providers)...")
    
    // Sync both Gmail and Microsoft accounts
    const gmailResult = await EmailSyncService.syncGmailAccounts()
    console.log("[Email Sync API] Gmail sync complete:", gmailResult)
    
    const microsoftResult = await EmailSyncService.syncMicrosoftAccounts()
    console.log("[Email Sync API] Microsoft sync complete:", microsoftResult)
    
    return NextResponse.json({
      success: true,
      message: "Email sync completed",
      gmail: {
        accountsProcessed: gmailResult.accountsProcessed,
        messagesFetched: gmailResult.messagesFetched,
        repliesPersisted: gmailResult.repliesPersisted,
        errors: gmailResult.errors
      },
      microsoft: {
        accountsProcessed: microsoftResult.accountsProcessed,
        messagesFetched: microsoftResult.messagesFetched,
        repliesPersisted: microsoftResult.repliesPersisted,
        errors: microsoftResult.errors
      },
      total: {
        accountsProcessed: gmailResult.accountsProcessed + microsoftResult.accountsProcessed,
        messagesFetched: gmailResult.messagesFetched + microsoftResult.messagesFetched,
        repliesPersisted: gmailResult.repliesPersisted + microsoftResult.repliesPersisted,
        errors: gmailResult.errors + microsoftResult.errors
      }
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

