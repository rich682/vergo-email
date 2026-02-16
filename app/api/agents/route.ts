/**
 * Agents API
 *
 * GET  /api/agents — List agents for the organization
 * POST /api/agents — Create a new agent
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { AgentDefinitionService } from "@/lib/agents/agent-definition.service"
import type { AgentTaskType } from "@/lib/agents/types"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "agents:view", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const configId = searchParams.get("configId")

    let agents
    if (configId) {
      const agent = await AgentDefinitionService.findByConfig(
        session.user.organizationId,
        configId
      )
      agents = agent ? [agent] : []
    } else {
      agents = await AgentDefinitionService.list(session.user.organizationId)
    }

    return NextResponse.json({ agents })
  } catch (error) {
    console.error("Error listing agents:", error)
    return NextResponse.json({ error: "Failed to list agents" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "agents:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { taskType, name, description, configId, configType, settings } = body

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    if (taskType && !["reconciliation", "report", "form", "request"].includes(taskType)) {
      return NextResponse.json({ error: "Invalid task type" }, { status: 400 })
    }

    const agent = await AgentDefinitionService.create({
      organizationId: session.user.organizationId,
      createdById: session.user.id,
      taskType: (taskType as AgentTaskType) || null,
      name,
      description,
      configId,
      configType,
      settings,
    })

    return NextResponse.json({ agent }, { status: 201 })
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "An agent already exists for this configuration" },
        { status: 409 }
      )
    }
    console.error("Error creating agent:", error)
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 })
  }
}
