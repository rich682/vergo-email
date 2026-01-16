/**
 * Admin API endpoint to debug connected email accounts
 * Shows what email addresses are stored for each account
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    // Get all connected accounts for this org
    const accounts = await prisma.connectedEmailAccount.findMany({
      where: {
        organizationId: session.user.organizationId
      },
      select: {
        id: true,
        email: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        syncCursor: true,
        createdAt: true
      }
    })

    return NextResponse.json({
      success: true,
      connectedEmailAccounts: accounts.map(a => ({
        id: a.id,
        email: a.email,
        provider: a.provider,
        isActive: a.isActive,
        lastSyncAt: a.lastSyncAt,
        hasCursor: !!a.syncCursor,
        cursorType: a.syncCursor ? Object.keys(a.syncCursor as object) : [],
        createdAt: a.createdAt
      }))
    })
  } catch (error: any) {
    console.error("[Debug Accounts API] Error:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch accounts",
        message: error.message 
      },
      { status: 500 }
    )
  }
}

// POST to reset sync cursor for an account (force re-bootstrap)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { accountId } = body

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      )
    }

    // Reset the sync cursor to force a fresh bootstrap
    const updated = await prisma.connectedEmailAccount.updateMany({
      where: {
        id: accountId,
        organizationId: session.user.organizationId
      },
      data: {
        syncCursor: null
      }
    })

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Account not found or not authorized" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Sync cursor reset. Next sync will re-bootstrap and fetch recent messages."
    })
  } catch (error: any) {
    console.error("[Debug Accounts API] Error resetting cursor:", error)
    return NextResponse.json(
      { 
        error: "Failed to reset cursor",
        message: error.message 
      },
      { status: 500 }
    )
  }
}
