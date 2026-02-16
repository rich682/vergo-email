/**
 * Agent Executions API
 *
 * GET /api/agents/[agentId]/executions — List execution history
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { AgentExecutionService } from "@/lib/agents/agent-execution.service"

interface RouteParams {
  params: { agentId: string }
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

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)

    const executions = await AgentExecutionService.listForAgent(
      params.agentId,
      session.user.organizationId,
      limit
    )

    return NextResponse.json({ executions })
  } catch (error) {
    console.error("Error listing executions:", error)
    return NextResponse.json({ error: "Failed to list executions" }, { status: 500 })
  }
}
