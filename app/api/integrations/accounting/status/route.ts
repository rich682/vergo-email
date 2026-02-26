/**
 * Accounting Integration - Status
 *
 * GET /api/integrations/accounting/status
 * Returns the current integration status including connection info,
 * sync state per model, and configuration.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: session.user.organizationId },
    })

    if (!integration) {
      return NextResponse.json({ connected: false })
    }

    // Get row counts for synced databases
    const syncedDatabases = await prisma.database.findMany({
      where: {
        organizationId: session.user.organizationId,
        sourceType: { not: null },
      },
      select: {
        sourceType: true,
        rowCount: true,
        name: true,
        lastImportedAt: true,
      },
    })

    const databaseStats = syncedDatabases.reduce(
      (acc, db) => {
        if (db.sourceType) {
          acc[db.sourceType] = {
            name: db.name,
            rowCount: db.rowCount,
            lastImportedAt: db.lastImportedAt,
          }
        }
        return acc
      },
      {} as Record<string, { name: string; rowCount: number; lastImportedAt: Date | null }>
    )

    return NextResponse.json({
      connected: integration.isActive,
      integrationName: integration.integrationName,
      integrationSlug: integration.integrationSlug,
      connectedAt: integration.connectedAt,
      endUserEmail: integration.endUserEmail,
      lastSyncAt: integration.lastSyncAt,
      syncStatus: integration.syncStatus,
      syncState: integration.syncState,
      syncConfig: integration.syncConfig,
      lastSyncError: integration.lastSyncError,
      databaseStats,
    })
  } catch (error) {
    console.error("Error fetching integration status:", error)
    return NextResponse.json(
      { error: "Failed to fetch integration status" },
      { status: 500 }
    )
  }
}
