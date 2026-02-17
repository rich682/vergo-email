/**
 * POST /api/workflow-runs/[id]/approve — Approve or reject a workflow step
 *
 * Body: { stepId: string, decision: "approved" | "rejected" }
 *
 * Emits "workflow/approved" Inngest event to resume the waiting workflow runner.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { inngest } from "@/inngest/client"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: workflowRunId } = await params
  const organizationId = session.user.organizationId
  const userId = session.user.id

  // Require agents:manage permission for approval actions
  if (!canPerformAction(session.user.role as any, "agents:manage" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const body = await request.json()
  const { stepId, decision } = body

  if (!stepId || !decision || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json(
      { error: "stepId and decision (approved|rejected) are required" },
      { status: 400 }
    )
  }

  // Verify the run exists, belongs to org, and is waiting for approval
  const run = await prisma.workflowRun.findFirst({
    where: { id: workflowRunId, organizationId },
    select: { id: true, status: true, currentStepId: true },
  })

  if (!run) {
    return NextResponse.json({ error: "Workflow run not found" }, { status: 404 })
  }

  if (run.status !== "WAITING_APPROVAL") {
    return NextResponse.json(
      { error: `Workflow run is not waiting for approval (status: ${run.status})` },
      { status: 400 }
    )
  }

  if (run.currentStepId !== stepId) {
    return NextResponse.json(
      { error: `Workflow is not waiting on step ${stepId} (current: ${run.currentStepId})` },
      { status: 400 }
    )
  }

  // Emit the approval event for the workflow runner to pick up
  await inngest.send({
    name: "workflow/approved",
    data: {
      workflowRunId,
      stepId,
      approvedBy: userId,
      decision,
    },
  })

  return NextResponse.json({
    success: true,
    workflowRunId,
    stepId,
    decision,
  })
}
