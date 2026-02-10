/**
 * Database Sync API
 *
 * POST /api/databases/[id]/sync
 * Syncs a single database from its accounting source with a specific "as of" date.
 * Only works for databases with a sourceType (accounting-linked databases).
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true, role: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Validate database exists and belongs to org
    const database = await prisma.database.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    if (!database.sourceType) {
      return NextResponse.json(
        { error: "This database is not linked to an accounting source" },
        { status: 400 }
      )
    }

    // Check sync not already in progress
    if (database.syncStatus === "syncing") {
      return NextResponse.json(
        { error: "Sync already in progress" },
        { status: 409 }
      )
    }

    // Verify accounting integration is active
    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: user.organizationId },
    })

    if (!integration || !integration.isActive) {
      return NextResponse.json(
        { error: "No active accounting integration" },
        { status: 400 }
      )
    }

    // Parse asOfDate from body
    let asOfDate: string
    try {
      const body = await request.json()
      if (body.asOfDate && typeof body.asOfDate === "string") {
        const parsed = new Date(body.asOfDate)
        if (isNaN(parsed.getTime())) {
          return NextResponse.json(
            { error: "Invalid date format" },
            { status: 400 }
          )
        }
        asOfDate = body.asOfDate
      } else {
        asOfDate = new Date().toISOString().split("T")[0]
      }
    } catch {
      asOfDate = new Date().toISOString().split("T")[0]
    }

    // Perform sync (inline, not via Inngest — it's a single database)
    const { AccountingSyncService } = await import(
      "@/lib/services/accounting-sync.service"
    )

    const result = await AccountingSyncService.syncSingleDatabase(
      params.id,
      asOfDate
    )

    return NextResponse.json({
      success: true,
      rowCount: result.rowCount,
      asOfDate,
    })
  } catch (error) {
    console.error("Error syncing database:", error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Sync failed: ${msg}` },
      { status: 500 }
    )
  }
}
