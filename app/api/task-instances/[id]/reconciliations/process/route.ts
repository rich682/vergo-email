import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationProcessorService } from "@/lib/services/reconciliation-processor.service"

export const dynamic = "force-dynamic"

/**
 * POST /api/task-instances/[id]/reconciliations/process
 * Process a pending reconciliation - compare the two uploaded documents
 * 
 * Request body:
 * { reconciliationId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { reconciliationId } = body

    if (!reconciliationId) {
      return NextResponse.json(
        { error: "reconciliationId is required" },
        { status: 400 }
      )
    }

    // Verify reconciliation belongs to this job and organization
    const reconciliation = await prisma.reconciliation.findFirst({
      where: {
        id: reconciliationId,
        taskInstanceId: jobId,
        organizationId
      }
    })

    if (!reconciliation) {
      return NextResponse.json(
        { error: "Reconciliation not found" },
        { status: 404 }
      )
    }

    // Check if already processing or completed
    if (reconciliation.status === "PROCESSING") {
      return NextResponse.json(
        { error: "Reconciliation is already being processed" },
        { status: 400 }
      )
    }

    if (reconciliation.status === "COMPLETED") {
      return NextResponse.json(
        { 
          error: "Reconciliation already completed",
          result: reconciliation.result,
          summary: reconciliation.summary
        },
        { status: 400 }
      )
    }

    // Process the reconciliation
    const result = await ReconciliationProcessorService.processReconciliation(
      reconciliationId
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Processing failed" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      summary: result.summary,
      matchedCount: result.matchedCount,
      unmatchedCount: result.unmatchedCount,
      totalRows: result.totalRows,
      discrepancies: result.discrepancies,
      columnMappings: result.columnMappings,
      keyColumn: result.keyColumn
    })
  } catch (error: any) {
    console.error("[API/reconciliations/process] Error:", error)
    return NextResponse.json(
      { error: "Failed to process reconciliation", message: error.message },
      { status: 500 }
    )
  }
}
