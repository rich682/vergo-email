/**
 * GET /api/reconciliations/[configId]/runs/[runId] - Get full run data (includes row data, match results, exceptions)
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: Promise<{ configId: string; runId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId, runId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:view_runs", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    // Non-admin must be a viewer of the config or have view_all_configs permission
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

    const run = await ReconciliationService.getRun(runId, session.user.organizationId)
    if (!run || run.configId !== configId) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    return NextResponse.json({ run })
  } catch (error) {
    console.error("[Reconciliations] Error fetching run:", error)
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 })
  }
}
