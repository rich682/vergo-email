/**
 * POST /api/reconciliations/[configId]/runs/[runId]/accept-matches
 * Persist the accepted flag on a set of matches. Body: { indices: number[], accepted: boolean }
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { canPerformAction } from "@/lib/permissions"

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

    if (!canPerformAction(session.user.role, "reconciliations:resolve", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to accept matches" }, { status: 403 })
    }

    const isAdmin = session.user.role === "ADMIN"
    const canViewAllConfigs = canPerformAction(session.user.role, "reconciliations:view_all_configs", session.user.orgActionPermissions)
    if (!isAdmin && !canViewAllConfigs) {
      const isViewer = await ReconciliationService.isViewer(configId, session.user.id)
      if (!isViewer) {
        return NextResponse.json(
          { error: "You do not have viewer access to this reconciliation" },
          { status: 403 }
        )
      }
    }

    const body = await request.json()
    const { indices, accepted } = body

    if (!Array.isArray(indices) || indices.some((n: unknown) => typeof n !== "number")) {
      return NextResponse.json({ error: "indices must be an array of numbers" }, { status: 400 })
    }
    if (typeof accepted !== "boolean") {
      return NextResponse.json({ error: "accepted must be a boolean" }, { status: 400 })
    }

    const result = await ReconciliationService.setMatchesAccepted(
      runId,
      session.user.organizationId,
      indices,
      accepted
    )

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error("[Reconciliations] Error setting accepted flag:", error)
    return NextResponse.json({ error: "Failed to update accepted flag" }, { status: 500 })
  }
}
