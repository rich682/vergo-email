/**
 * POST /api/reconciliations/[configId]/runs/[runId]/match
 * Trigger matching engine on a run that has both sources uploaded.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { ReconciliationMatchingService } from "@/lib/services/reconciliation-matching.service"
import { ReconciliationRunStatus } from "@prisma/client"
import { canPerformAction } from "@/lib/permissions"
import { inngest } from "@/inngest/client"

export const maxDuration = 60
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
      return NextResponse.json({ error: "You do not have permission to run reconciliation matching" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
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

    // Get run with config
    const run = await ReconciliationService.getRun(runId, user.organizationId)
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    if (!run.sourceARows || !run.sourceBRows) {
      return NextResponse.json({ error: "Both source files must be uploaded before matching" }, { status: 400 })
    }

    // Set status to PROCESSING
    await ReconciliationService.updateRunStatus(runId, user.organizationId, ReconciliationRunStatus.PROCESSING)

    const sourceAConfig = run.config.sourceAConfig as any
    const sourceBConfig = run.config.sourceBConfig as any
    const matchingRules = run.config.matchingRules as any

    // Run matching
    const result = await ReconciliationMatchingService.runMatching(
      run.sourceARows as Record<string, any>[],
      run.sourceBRows as Record<string, any>[],
      sourceAConfig,
      sourceBConfig,
      matchingRules
    )

    // Convert exceptions array to a keyed object for easier UI updates
    const exceptionsMap: Record<string, any> = {}
    for (const exc of result.exceptions) {
      const key = `${exc.source}-${exc.rowIdx}`
      exceptionsMap[key] = {
        category: exc.category,
        reason: exc.reason,
        source: exc.source,
        rowIdx: exc.rowIdx,
      }
    }

    // Save results
    await ReconciliationService.saveMatchResults(runId, user.organizationId, {
      matchResults: {
        matched: result.matched,
        unmatchedA: result.unmatchedA,
        unmatchedB: result.unmatchedB,
      },
      exceptions: exceptionsMap,
      matchedCount: result.matched.length,
      exceptionCount: result.unmatchedA.length + result.unmatchedB.length,
      variance: result.variance,
    })

    // Emit workflow trigger for data_uploaded
    try {
      await inngest.send({
        name: "workflow/trigger",
        data: {
          triggerType: "data_uploaded",
          triggerEventId: runId,
          organizationId: user.organizationId,
          metadata: {
            configId,
            runId,
            matchedCount: result.matched.length,
            exceptionCount: result.unmatchedA.length + result.unmatchedB.length,
            variance: result.variance,
          },
        },
      })
    } catch (triggerError) {
      console.error("[Reconciliations] Failed to emit workflow trigger:", triggerError)
    }

    return NextResponse.json({
      success: true,
      matchedCount: result.matched.length,
      exceptionCount: result.unmatchedA.length + result.unmatchedB.length,
      variance: result.variance,
    })
  } catch (error) {
    console.error("[Reconciliations] Error running matching:", error)
    return NextResponse.json({ error: "Failed to run matching" }, { status: 500 })
  }
}
