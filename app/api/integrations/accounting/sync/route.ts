/**
 * Accounting Integration - Sync
 *
 * POST /api/integrations/accounting/sync
 * Resyncs contacts from accounting software.
 * Body: { contactsOnly?: true }
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Check that integration exists and is active
    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: session.user.organizationId },
    })

    if (!integration || !integration.isActive) {
      return NextResponse.json(
        { error: "No active accounting integration" },
        { status: 400 }
      )
    }

    // Resync contacts directly
    const { AccountingSyncService } = await import(
      "@/lib/services/accounting-sync.service"
    )
    const accountToken = decrypt(integration.accountToken)
    const contactsSynced = await AccountingSyncService.syncContacts(
      session.user.organizationId,
      accountToken
    )

    return NextResponse.json({
      success: true,
      message: `${contactsSynced} contacts synced`,
      contactsSynced,
    })
  } catch (error) {
    console.error("Error syncing contacts:", error)
    return NextResponse.json(
      { error: "Failed to sync contacts" },
      { status: 500 }
    )
  }
}
