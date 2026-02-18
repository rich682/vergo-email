/**
 * POST /api/reconciliations/[configId]/runs/[runId]/load-database
 * Load rows from database source(s) into the reconciliation run.
 * Used for database_database and database_document source types.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { populateRunFromDatabases } from "@/lib/services/reconciliation-database.service"
import type { SourceConfig } from "@/lib/services/reconciliation.service"

interface RouteParams {
  params: Promise<{ configId: string; runId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId, runId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const organizationId = session.user.organizationId

    // Load config to get source definitions
    const config = await prisma.reconciliationConfig.findFirst({
      where: { id: configId, organizationId },
      select: { sourceType: true, sourceAConfig: true, sourceBConfig: true },
    })

    if (!config) {
      return NextResponse.json({ error: "Reconciliation config not found" }, { status: 404 })
    }

    if (config.sourceType === "document_document") {
      return NextResponse.json(
        { error: "This reconciliation uses file uploads, not database sources" },
        { status: 400 }
      )
    }

    // Verify run exists and belongs to this config
    const run = await prisma.reconciliationRun.findFirst({
      where: { id: runId, configId, organizationId },
      select: { status: true },
    })

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    if (run.status !== "PENDING") {
      return NextResponse.json(
        { error: "Data can only be loaded for runs in PENDING status" },
        { status: 400 }
      )
    }

    // Optional period key for filtering
    const body = await request.json().catch(() => ({}))
    const periodKey = (body.periodKey as string) || undefined

    const result = await populateRunFromDatabases({
      runId,
      organizationId,
      sourceAConfig: config.sourceAConfig as unknown as SourceConfig,
      sourceBConfig: config.sourceBConfig as unknown as SourceConfig,
      periodKey,
    })

    return NextResponse.json({
      sourceARowCount: result.sourceARowCount,
      sourceBRowCount: result.sourceBRowCount,
      periodKey: periodKey || null,
    })
  } catch (error: any) {
    console.error("[Reconciliation] Error loading database rows:", error)
    return NextResponse.json(
      { error: error.message || "Failed to load database rows" },
      { status: 500 }
    )
  }
}
