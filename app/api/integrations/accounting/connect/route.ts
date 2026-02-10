/**
 * Accounting Integration - Connect
 *
 * POST /api/integrations/accounting/connect
 * Exchanges a Merge Link public token for a permanent account token
 * and stores the integration. Triggers initial sync.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/encryption"
import { MergeAccountingService } from "@/lib/services/merge-accounting.service"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true, role: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { publicToken } = body

    if (!publicToken || typeof publicToken !== "string") {
      return NextResponse.json(
        { error: "publicToken is required" },
        { status: 400 }
      )
    }

    // Exchange public token for account token
    const result = await MergeAccountingService.exchangePublicToken(publicToken)

    const defaultSyncConfig = {
      contacts: true,
    }

    // Upsert the integration record
    await prisma.accountingIntegration.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        accountToken: encrypt(result.account_token),
        integrationName: result.integration.name,
        integrationSlug: result.integration.slug,
        endUserEmail: session.user.email,
        syncConfig: defaultSyncConfig,
      },
      update: {
        accountToken: encrypt(result.account_token),
        integrationName: result.integration.name,
        integrationSlug: result.integration.slug,
        endUserEmail: session.user.email,
        isActive: true,
        disconnectedAt: null,
        syncConfig: defaultSyncConfig,
        syncState: {},
        lastSyncError: null,
        syncStatus: "idle",
      },
    })

    // Sync contacts into Entity model (non-blocking — best effort)
    try {
      const { AccountingSyncService } = await import(
        "@/lib/services/accounting-sync.service"
      )
      await AccountingSyncService.syncContacts(
        user.organizationId,
        result.account_token
      )
    } catch (e) {
      console.warn("Initial contact sync failed (non-blocking):", e)
    }

    return NextResponse.json({
      success: true,
      integrationName: result.integration.name,
    })
  } catch (error) {
    console.error("Error connecting accounting integration:", error)
    return NextResponse.json(
      { error: "Failed to connect accounting integration" },
      { status: 500 }
    )
  }
}
