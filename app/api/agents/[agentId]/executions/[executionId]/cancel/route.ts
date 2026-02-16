/**
 * Cancel Execution API
 *
 * POST /api/agents/[agentId]/executions/[executionId]/cancel — Cancel a running execution
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { AgentExecutionService } from "@/lib/agents/agent-execution.service"

interface RouteParams {
  params: { agentId: string; executionId: string }
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

    const execution = await AgentExecutionService.getById(
      params.executionId,
      session.user.organizationId
    )

    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 })
    }

    if (execution.status !== "running") {
      return NextResponse.json({ error: "Execution is not running" }, { status: 400 })
    }

    await AgentExecutionService.cancel(params.executionId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error cancelling execution:", error)
    return NextResponse.json({ error: "Failed to cancel execution" }, { status: 500 })
  }
}
