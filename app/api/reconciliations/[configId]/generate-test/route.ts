/**
 * POST /api/reconciliations/[configId]/generate-test
 * Simplified: just creates a run and returns the ID.
 * The client then uses the standard upload + match endpoints.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { canPerformAction } from "@/lib/permissions"

export async function POST(request: NextRequest, { params }: { params: Promise<{ configId: string }> }) {
  const { configId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "No permission" }, { status: 403 })
  }

  const config = await ReconciliationService.getConfig(configId, session.user.organizationId)
  if (!config) {
    return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 })
  }

  // Just create the run — client handles upload + matching via standard endpoints
  const run = await ReconciliationService.createRun({
    configId,
    organizationId: session.user.organizationId,
  })

  return NextResponse.json({ runId: run.id })
}
