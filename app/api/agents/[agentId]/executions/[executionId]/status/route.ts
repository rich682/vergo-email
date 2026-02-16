/**
 * Execution Status API (Polling)
 *
 * GET /api/agents/[agentId]/executions/[executionId]/status — Get current step + progress
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { AgentExecutionService } from "@/lib/agents/agent-execution.service"

interface RouteParams {
  params: { agentId: string; executionId: string }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "agents:view", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const status = await AgentExecutionService.getStatus(
      params.executionId,
      session.user.organizationId
    )

    if (!status) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 })
    }

    return NextResponse.json({ status })
  } catch (error) {
    console.error("Error getting execution status:", error)
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 })
  }
}
