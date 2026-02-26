import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { google } from "googleapis"
import { EmailConnectionService } from "@/lib/services/email-connection.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/debug-email-sync
 * Debug endpoint to check email sync status and what's in Gmail
 * 
 * Query params:
 *   - resetCursor=true : Reset the sync cursor to force a fresh scan
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const resetCursor = searchParams.get("resetCursor") === "true"

    // Get all Gmail accounts for this org
    const accounts = await prisma.connectedEmailAccount.findMany({
      where: {
        provider: "GMAIL",
        isActive: true,
        organization: {
          id: session.user.organizationId
        }
      },
      select: {
        id: true,
        email: true,
        syncCursor: true,
        lastSyncAt: true,
        createdAt: true
      }
    })

    if (accounts.length === 0) {
      return NextResponse.json({
        error: "No Gmail accounts found",
        accounts: []
      })
    }

    const results = []

    for (const account of accounts) {
      const result: any = {
        accountId: account.id,
        email: account.email,
        currentCursor: account.syncCursor,
        lastSyncAt: account.lastSyncAt,
        recentInboxEmails: [],
        error: null
      }

      try {
        const oauth2Client = await EmailConnectionService.getGmailClient(account.id)
        if (!oauth2Client) {
          result.error = "Failed to get OAuth client - token may be expired"
          results.push(result)
          continue
        }

        const gmail = google.gmail({ version: "v1", auth: oauth2Client })

        // Get Gmail profile
        const profile = await gmail.users.getProfile({ userId: "me" })
        result.currentHistoryId = profile.data.historyId

        // List recent inbox emails (last 24 hours)
        const afterSeconds = Math.floor(Date.now() / 1000) - 24 * 60 * 60
        const listResp = await gmail.users.messages.list({
          userId: "me",
          q: `in:inbox after:${afterSeconds}`,
          maxResults: 20
        })

        const messageIds = listResp.data.messages?.map(m => m.id) || []
        
        // Get details of each message
        for (const messageId of messageIds.slice(0, 10)) { // Limit to 10
          try {
            const msg = await gmail.users.messages.get({
              userId: "me",
              id: messageId!,
              format: "metadata",
              metadataHeaders: ["From", "Subject", "Date", "In-Reply-To"]
            })

            const headers = msg.data.payload?.headers || []
            const getHeader = (name: string) => 
              headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value

            result.recentInboxEmails.push({
              id: messageId,
              threadId: msg.data.threadId,
              historyId: msg.data.historyId,
              from: getHeader("From"),
              subject: getHeader("Subject"),
              date: getHeader("Date"),
              inReplyTo: getHeader("In-Reply-To") || null,
              labelIds: msg.data.labelIds
            })
          } catch (msgError: any) {
            result.recentInboxEmails.push({
              id: messageId,
              error: msgError.message
            })
          }
        }

        result.totalInboxLast24h = messageIds.length

        // Reset cursor if requested
        if (resetCursor) {
          await prisma.connectedEmailAccount.update({
            where: { id: account.id },
            data: { syncCursor: undefined }
          })
          result.cursorReset = true
          result.message = "Cursor reset - next sync will do a fresh 24h scan"
        }

      } catch (error: any) {
        result.error = error.message
      }

      results.push(result)
    }

    return NextResponse.json({
      accounts: results,
      tip: "If emails exist but aren't syncing, try ?resetCursor=true to force a fresh scan"
    })

  } catch (error: any) {
    console.error("[Debug Email Sync] Error:", error)
    return NextResponse.json(
      { error: "Debug failed", message: error.message },
      { status: 500 }
    )
  }
}
