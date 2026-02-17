/**
 * POST /api/reconciliations/[configId]/runs/[runId]/accept-match
 * Accept a manual match: move an unmatched Source A row + Source B row into matched.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: Promise<{ configId: string; runId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId, runId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:resolve", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to accept matches" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Non-admin must be a viewer of the config
    const isAdmin = session.user.role === "ADMIN"
    if (!isAdmin) {
      const isViewer = await ReconciliationService.isViewer(configId, session.user.id)
      if (!isViewer) {
        return NextResponse.json(
          { error: "You do not have viewer access to this reconciliation" },
          { status: 403 }
        )
      }
    }

    const body = await request.json()
    const { sourceAIdx, sourceBIdx } = body

    if (sourceAIdx === undefined || sourceBIdx === undefined) {
      return NextResponse.json({ error: "sourceAIdx and sourceBIdx are required" }, { status: 400 })
    }

    const result = await ReconciliationService.acceptManualMatch(
      runId,
      user.organizationId,
      sourceAIdx,
      sourceBIdx
    )

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error("[Reconciliations] Error accepting manual match:", error)
    return NextResponse.json({ error: "Failed to accept match" }, { status: 500 })
  }
}
