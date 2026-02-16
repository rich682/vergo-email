/**
 * Agent Memory API
 *
 * GET /api/agents/[agentId]/memory — Get agent memories
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

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
    const scope = searchParams.get("scope") // "entity" | "pattern" | "config" | null (all)
    const includeArchived = searchParams.get("includeArchived") === "true"

    const memories = await prisma.agentMemory.findMany({
      where: {
        agentDefinitionId: params.agentId,
        organizationId: session.user.organizationId,
        ...(scope ? { scope } : {}),
        ...(!includeArchived ? { isArchived: false } : {}),
      },
      orderBy: [{ scope: "asc" }, { confidence: "desc" }],
    })

    return NextResponse.json({ memories })
  } catch (error) {
    console.error("Error getting memories:", error)
    return NextResponse.json({ error: "Failed to get memories" }, { status: 500 })
  }
}
