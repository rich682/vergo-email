/**
 * Analysis Conversations API
 *
 * GET  — List user's conversations
 * POST — Create a new conversation
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:view", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const taskInstanceId = searchParams.get("taskInstanceId")
  const boardId = searchParams.get("boardId")

  // Users with view_all can see all org conversations; others only see their own
  const canViewAll = canPerformAction(session.user.role, "analysis:view_all", session.user.orgActionPermissions)

  const conversations = await prisma.analysisConversation.findMany({
    where: {
      organizationId: session.user.organizationId,
      ...(!canViewAll ? { userId: session.user.id } : {}),
      ...(taskInstanceId ? { taskInstanceId } : {}),
      ...(boardId ? { taskInstance: { boardId } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      databaseIds: true,
      taskInstanceId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
      taskInstance: {
        select: { id: true, name: true },
      },
    },
  })

  return NextResponse.json({ conversations })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:query", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { title, databaseIds, taskInstanceId } = body as {
    title?: string; databaseIds?: string[]; taskInstanceId?: string
  }

  const conversation = await prisma.analysisConversation.create({
    data: {
      organizationId: session.user.organizationId,
      userId: session.user.id,
      title: title || "New Analysis",
      databaseIds: databaseIds || [],
      ...(taskInstanceId ? { taskInstanceId } : {}),
    },
  })

  return NextResponse.json({ conversation })
}
