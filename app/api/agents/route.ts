/**
 * Agents API
 *
 * GET  /api/agents — List agents for the organization
 * POST /api/agents — Create a new agent
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
    const lineageId = searchParams.get("lineageId")

    let agents
    if (configId) {
      const agent = await AgentDefinitionService.findByConfig(
        session.user.organizationId,
        configId
      )
      agents = agent ? [agent] : []
    } else if (lineageId) {
      const agent = await AgentDefinitionService.findByLineage(
        session.user.organizationId,
        lineageId
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
    const { name, taskInstanceId, settings } = body

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    if (!taskInstanceId) {
      return NextResponse.json({ error: "taskInstanceId is required" }, { status: 400 })
    }

    const organizationId = session.user.organizationId

    // Look up the task to derive agent fields
    const task = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      select: {
        id: true,
        name: true,
        taskType: true,
        lineageId: true,
        reconciliationConfigId: true,
      },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Auto-create lineage if the task doesn't have one (promotes it to recurring)
    let lineageId = task.lineageId
    if (!lineageId) {
      const lineage = await prisma.taskLineage.create({
        data: {
          organizationId,
          name: task.name,
          config: {},
        },
      })
      lineageId = lineage.id
      // Link the task to the new lineage
      await prisma.taskInstance.update({
        where: { id: task.id },
        data: { lineageId: lineage.id },
      })
    }

    // Derive config from the task
    const configId = task.reconciliationConfigId || null
    const configType = configId ? "reconciliation_config" : null

    const agent = await AgentDefinitionService.create({
      organizationId,
      createdById: session.user.id,
      taskType: (task.taskType as AgentTaskType) || null,
      name,
      configId: configId || undefined,
      configType: configType || undefined,
      lineageId,
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
