/**
 * POST /api/automation-rules/[id]/run — Manually trigger a workflow run
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { inngest } from "@/inngest/client"
import { createRun } from "@/lib/workflows/workflow-engine.service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  if (!canPerformAction(session.user.role as any, "agents:execute" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const { id } = await params

  // Verify rule exists, belongs to org, and is active
  const rule = await prisma.automationRule.findFirst({
    where: { id, organizationId },
  })

  if (!rule) {
    return NextResponse.json({ error: "Automation rule not found" }, { status: 404 })
  }

  if (!rule.isActive) {
    return NextResponse.json({ error: "Automation is paused. Resume it before running." }, { status: 400 })
  }

  // Check for existing running/pending runs to prevent duplicates
  const existingRun = await prisma.workflowRun.findFirst({
    where: {
      automationRuleId: id,
      status: { in: ["PENDING", "RUNNING", "WAITING_APPROVAL"] },
    },
  })

  if (existingRun) {
    return NextResponse.json(
      { error: "This automation already has an active run. Wait for it to complete or cancel it first." },
      { status: 409 }
    )
  }

  const triggerContext = {
    triggerType: rule.trigger as any,
    triggerEventId: `manual:${Date.now()}`,
    organizationId,
    metadata: {
      triggeredBy: session.user.id,
      triggerMethod: "manual",
    },
  }

  // Create the workflow run with idempotency
  const idempotencyKey = `${id}:manual:${Date.now()}`
  const workflowRun = await createRun({
    automationRuleId: id,
    organizationId,
    triggerContext,
    idempotencyKey,
    triggeredBy: session.user.id,
  })

  if (!workflowRun) {
    return NextResponse.json(
      { error: "A run for this automation is already in progress." },
      { status: 409 }
    )
  }

  // Dispatch the Inngest event
  await inngest.send({
    name: "workflow/run",
    data: {
      automationRuleId: id,
      workflowRunId: workflowRun.id,
      organizationId,
      triggerContext,
    },
  })

  return NextResponse.json({ workflowRun }, { status: 201 })
}
