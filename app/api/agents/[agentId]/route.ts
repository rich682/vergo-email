/**
 * Agent Detail API
 *
 * GET    /api/agents/[agentId] — Get agent detail
 * PATCH  /api/agents/[agentId] — Update agent
 * DELETE /api/agents/[agentId] — Delete agent
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { AgentDefinitionService } from "@/lib/agents/agent-definition.service"

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

    const agent = await AgentDefinitionService.getById(params.agentId, session.user.organizationId)
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    return NextResponse.json({ agent })
  } catch (error) {
    console.error("Error getting agent:", error)
    return NextResponse.json({ error: "Failed to get agent" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "agents:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, settings, isActive } = body

    const agent = await AgentDefinitionService.update(
      params.agentId,
      session.user.organizationId,
      { name, description, settings, isActive }
    )

    return NextResponse.json({ agent })
  } catch (error) {
    console.error("Error updating agent:", error)
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "agents:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await AgentDefinitionService.delete(params.agentId, session.user.organizationId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting agent:", error)
    return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 })
  }
}
