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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:view_all_configs", session.user.orgActionPermissions)) {
      return NextResponse.json({ configs: [] })
    }

    const { searchParams } = new URL(request.url)
    const myItems = searchParams.get("myItems") === "true"

    const configs = await ReconciliationService.listConfigs(session.user.organizationId)

    // myItems: user explicitly wants only their own configs
    if (myItems) {
      const filteredConfigs = configs.filter((c) => c.createdById === session.user.id)
      return NextResponse.json({ configs: filteredConfigs })
    }

    return NextResponse.json({ configs })
  } catch (error) {
    console.error("[Reconciliations] Error listing configs:", error)
    return NextResponse.json({ error: "Failed to list reconciliations" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to create reconciliations" }, { status: 403 })
    }

    const body = await request.json()
    const { name, sourceType, sourceAConfig, sourceBConfig, matchingRules, matchingGuidelines } = body

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    // Check for duplicate name within the organization
    const existing = await prisma.reconciliationConfig.findFirst({
      where: { organizationId: session.user.organizationId, name: name.trim() },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: `A reconciliation with the name "${name.trim()}" already exists` },
        { status: 409 }
      )
    }

    const config = await ReconciliationService.createConfig({
      organizationId: session.user.organizationId,
      name,
      sourceType,
      sourceAConfig: sourceAConfig || { label: "Source A", columns: [] },
      sourceBConfig: sourceBConfig || { label: "Source B", columns: [] },
      matchingRules: matchingRules || {
        amountMatch: "exact",
        dateWindowDays: 3,
        fuzzyDescription: true,
      },
      ...(matchingGuidelines && {
        matchingGuidelines: {
          guidelines: matchingGuidelines,
          updatedAt: new Date().toISOString(),
          updatedBy: session.user.id,
        },
      }),
      createdById: session.user.id,
    })

    return NextResponse.json({ config }, { status: 201 })
  } catch (error: any) {
    console.error("[Reconciliations] Error creating config:", error)
    return NextResponse.json({ error: "Failed to create reconciliation" }, { status: 500 })
  }
}
