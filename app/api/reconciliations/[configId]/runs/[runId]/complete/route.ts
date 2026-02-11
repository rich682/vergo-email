/**
 * POST /api/reconciliations/[configId]/runs/[runId]/complete
 * Sign off / complete a reconciliation run.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { canPerformAction } from "@/lib/permissions"

export const maxDuration = 60
interface RouteParams {
  params: Promise<{ configId: string; runId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { runId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:resolve", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to complete reconciliation runs" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    await ReconciliationService.completeRun(runId, user.organizationId, user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Reconciliations] Error completing run:", error)
    return NextResponse.json({ error: "Failed to complete reconciliation" }, { status: 500 })
  }
}
