/**
 * Accounting Integration - Disconnect
 *
 * DELETE /api/integrations/accounting/disconnect
 * Soft-deletes the integration and revokes the token on Merge.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { MergeAccountingService } from "@/lib/services/merge-accounting.service"

export async function DELETE(request: NextRequest) {
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

    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: user.organizationId },
    })

    if (!integration) {
      return NextResponse.json(
        { error: "No accounting integration found" },
        { status: 404 }
      )
    }

    // Revoke on Merge (best-effort)
    if (integration.isActive) {
      try {
        const accountToken = decrypt(integration.accountToken)
        await MergeAccountingService.deleteLinkedAccount(accountToken)
      } catch (e) {
        console.warn("Failed to delete Merge linked account:", e)
      }
    }

    // Soft-delete the integration
    await prisma.accountingIntegration.update({
      where: { id: integration.id },
      data: {
        isActive: false,
        disconnectedAt: new Date(),
        syncStatus: "idle",
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error disconnecting integration:", error)
    return NextResponse.json(
      { error: "Failed to disconnect integration" },
      { status: 500 }
    )
  }
}
