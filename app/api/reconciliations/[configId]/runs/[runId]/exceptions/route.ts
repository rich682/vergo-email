/**
 * PATCH /api/reconciliations/[configId]/runs/[runId]/exceptions
 * Update exception resolutions.
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { runId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:resolve", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to resolve reconciliation exceptions" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true, name: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const body = await request.json()
    const { key, resolution, category, notes } = body

    if (!key) {
      return NextResponse.json({ error: "Exception key is required" }, { status: 400 })
    }

    // Get current run
    const run = await ReconciliationService.getRun(runId, user.organizationId)
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    // Update the specific exception
    const exceptions = (run.exceptions as Record<string, any>) || {}
    if (exceptions[key]) {
      if (resolution !== undefined) exceptions[key].resolution = resolution
      if (category !== undefined) exceptions[key].category = category
      if (notes !== undefined) exceptions[key].notes = notes
      exceptions[key].resolvedBy = user.name || user.id
    }

    await ReconciliationService.updateExceptions(runId, user.organizationId, exceptions)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Reconciliations] Error updating exception:", error)
    return NextResponse.json({ error: "Failed to update exception" }, { status: 500 })
  }
}
