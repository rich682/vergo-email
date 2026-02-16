/**
 * Agent Execute API
 *
 * POST /api/agents/[agentId]/execute — Trigger a manual agent run
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { inngest } from "@/inngest/client"

interface RouteParams {
  params: { agentId: string }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "agents:execute", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Verify agent exists and is active
    const agent = await prisma.agentDefinition.findFirst({
      where: {
        id: params.agentId,
        organizationId: session.user.organizationId,
      },
    })

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    if (!agent.isActive) {
      return NextResponse.json({ error: "Agent is inactive" }, { status: 400 })
    }

    // Check for already-running execution
    const running = await prisma.agentExecution.findFirst({
      where: {
        agentDefinitionId: params.agentId,
        status: "running",
      },
    })

    if (running) {
      return NextResponse.json(
        { error: "Agent already has a running execution", executionId: running.id },
        { status: 409 }
      )
    }

    // Get optional reconciliation run ID from body
    const body = await request.json().catch(() => ({}))
    const { reconciliationRunId } = body

    // Send event to Inngest
    await inngest.send({
      name: "agent/run",
      data: {
        agentDefinitionId: params.agentId,
        organizationId: session.user.organizationId,
        triggeredBy: session.user.id,
        reconciliationRunId: reconciliationRunId || null,
      },
    })

    return NextResponse.json({ success: true, message: "Agent execution started" })
  } catch (error) {
    console.error("Error executing agent:", error)
    return NextResponse.json({ error: "Failed to execute agent" }, { status: 500 })
  }
}
