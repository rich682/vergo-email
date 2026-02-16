/**
 * Agent Metrics API
 *
 * GET /api/agents/[agentId]/metrics — Get improvement metrics over time
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { getImprovementTrend } from "@/lib/agents/learning/metrics-tracker"

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

    const trend = await getImprovementTrend(params.agentId, limit)

    return NextResponse.json({ metrics: trend })
  } catch (error) {
    console.error("Error getting metrics:", error)
    return NextResponse.json({ error: "Failed to get metrics" }, { status: 500 })
  }
}
