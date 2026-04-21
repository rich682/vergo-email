/**
 * POST /api/reconciliations/[configId]/runs/[runId]/accept-match
 * Accept a manual match: move an unmatched Source A row + Source B row into matched.
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

    const body = await request.json()
    const { sourceAIdx, sourceAIdxs, sourceBIdx, sourceBIdxs } = body

    // Accept scalar or array forms on either side (many-to-one in either direction).
    const aIdxsArray: number[] | undefined = Array.isArray(sourceAIdxs)
      ? sourceAIdxs.filter((n: unknown) => typeof n === "number")
      : undefined
    const bIdxsArray: number[] | undefined = Array.isArray(sourceBIdxs)
      ? sourceBIdxs.filter((n: unknown) => typeof n === "number")
      : undefined

    const aInput: number | number[] | undefined =
      aIdxsArray && aIdxsArray.length > 0
        ? aIdxsArray
        : (typeof sourceAIdx === "number" ? sourceAIdx : undefined)
    const bInput: number | number[] | undefined =
      bIdxsArray && bIdxsArray.length > 0
        ? bIdxsArray
        : (typeof sourceBIdx === "number" ? sourceBIdx : undefined)

    if (aInput === undefined || bInput === undefined) {
      return NextResponse.json(
        { error: "Both a Source A and a Source B index (or array) are required" },
        { status: 400 }
      )
    }

    const result = await ReconciliationService.acceptManualMatch(
      runId,
      session.user.organizationId,
      aInput,
      bInput
    )

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error("[Reconciliations] Error accepting manual match:", error)
    return NextResponse.json({ error: "Failed to accept match" }, { status: 500 })
  }
}
