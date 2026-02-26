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
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const integration = await prisma.accountingIntegration.findUnique({
      where: { organizationId: session.user.organizationId },
    })

    if (!integration) {
      return NextResponse.json(
        { error: "No accounting integration found" },
        { status: 404 }
      )
    }

    // Delete the linked account on Merge
    let mergeDeleted = false
    if (integration.isActive) {
      try {
        const accountToken = decrypt(integration.accountToken)
        await MergeAccountingService.deleteLinkedAccount(accountToken)
        mergeDeleted = true
      } catch (e) {
        console.warn("Failed to delete Merge linked account:", e)
        // Continue with local cleanup even if Merge delete fails
      }
    }

    // Hard-delete the integration record so the user can reconnect cleanly
    await prisma.accountingIntegration.delete({
      where: { id: integration.id },
    })

    return NextResponse.json({ success: true, mergeDeleted })
  } catch (error) {
    console.error("Error disconnecting integration:", error)
    return NextResponse.json(
      { error: "Failed to disconnect integration" },
      { status: 500 }
    )
  }
}
