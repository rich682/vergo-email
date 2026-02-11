/**
 * GET /api/reconciliations - List all reconciliation configs for the org
 * POST /api/reconciliations - Create a new reconciliation config
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { canPerformAction } from "@/lib/permissions"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:view", session.user.orgActionPermissions)) {
      return NextResponse.json({ configs: [] })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const configs = await ReconciliationService.listConfigs(user.organizationId)
    return NextResponse.json({ configs })
  } catch (error) {
    console.error("[Reconciliations] Error listing configs:", error)
    return NextResponse.json({ error: "Failed to list reconciliations" }, { status: 500 })
  }
}

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

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to create reconciliations" }, { status: 403 })
    }

    const body = await request.json()
    const { name, sourceAConfig, sourceBConfig, matchingRules } = body

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const config = await ReconciliationService.createConfig({
      organizationId: user.organizationId,
      name,
      sourceAConfig: sourceAConfig || { label: "Source A", columns: [] },
      sourceBConfig: sourceBConfig || { label: "Source B", columns: [] },
      matchingRules: matchingRules || {
        amountMatch: "exact",
        dateWindowDays: 3,
        fuzzyDescription: true,
      },
    })

    return NextResponse.json({ config }, { status: 201 })
  } catch (error: any) {
    console.error("[Reconciliations] Error creating config:", error)
    return NextResponse.json({ error: "Failed to create reconciliation" }, { status: 500 })
  }
}
