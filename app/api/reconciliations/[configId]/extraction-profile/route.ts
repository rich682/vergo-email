/**
 * PATCH /api/reconciliations/[configId]/extraction-profile
 * Update the extraction profile for a source (A or B) on a reconciliation config.
 * Used to save document descriptions and AI parsing hints.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import type { ExtractionProfile, SourceConfig } from "@/lib/services/reconciliation.service"

interface RouteParams {
  params: Promise<{ configId: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage reconciliations" }, { status: 403 })
    }

    const body = await request.json()
    const { side, extractionProfile } = body as { side: "A" | "B"; extractionProfile: ExtractionProfile }

    if (!side || !["A", "B"].includes(side)) {
      return NextResponse.json({ error: 'side must be "A" or "B"' }, { status: 400 })
    }

    // Fetch current config
    const config = await prisma.reconciliationConfig.findFirst({
      where: { id: configId, organizationId: session.user.organizationId, deletedAt: null },
    })

    if (!config) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 })
    }

    // Merge extraction profile into the source config
    const configField = side === "A" ? "sourceAConfig" : "sourceBConfig"
    const currentSourceConfig = (config[configField] as unknown as SourceConfig) || { label: "", columns: [] }

    const updatedSourceConfig = {
      ...currentSourceConfig,
      extractionProfile: {
        ...currentSourceConfig.extractionProfile,
        ...extractionProfile,
        lastUpdated: new Date().toISOString(),
      },
    }

    await prisma.reconciliationConfig.update({
      where: { id: configId },
      data: { [configField]: updatedSourceConfig as any },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[Reconciliations] Error updating extraction profile:", error)
    return NextResponse.json({ error: "Failed to update extraction profile" }, { status: 500 })
  }
}
