/**
 * Accounting Integration - Link Token
 *
 * POST /api/integrations/accounting/link-token
 * Generates a Merge Link token for the embedded connection component.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true },
    })

    const result = await MergeAccountingService.createLinkToken({
      endUserEmail: session.user.email,
      endUserOrganizationName: org?.name || "Organization",
      endUserOriginId: user.organizationId,
    })

    return NextResponse.json({ linkToken: result.link_token })
  } catch (error) {
    console.error("Error creating link token:", error)
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 }
    )
  }
}
