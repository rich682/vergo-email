/**
 * Accounting Integration - Sync
 *
 * POST /api/integrations/accounting/sync
 * Triggers an on-demand sync via Inngest.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { inngest } from "@/inngest/client"

export async function POST(request: NextRequest) {
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

    // Check that integration exists and is active
    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: user.organizationId },
    })

    if (!integration || !integration.isActive) {
      return NextResponse.json(
        { error: "No active accounting integration" },
        { status: 400 }
      )
    }

    // Don't trigger if already syncing
    if (integration.syncStatus === "syncing") {
      return NextResponse.json(
        { error: "Sync already in progress" },
        { status: 409 }
      )
    }

    // Trigger sync via Inngest
    await inngest.send({
      name: "accounting/sync-triggered",
      data: { organizationId: user.organizationId },
    })

    return NextResponse.json({ success: true, message: "Sync initiated" })
  } catch (error) {
    console.error("Error triggering sync:", error)
    return NextResponse.json(
      { error: "Failed to trigger sync" },
      { status: 500 }
    )
  }
}
