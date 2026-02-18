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

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:view", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const conversations = await prisma.analysisConversation.findMany({
    where: {
      organizationId: session.user.organizationId,
      userId: session.user.id,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      databaseIds: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
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
  const { title, databaseIds } = body as { title?: string; databaseIds?: string[] }

  const conversation = await prisma.analysisConversation.create({
    data: {
      organizationId: session.user.organizationId,
      userId: session.user.id,
      title: title || "New Analysis",
      databaseIds: databaseIds || [],
    },
  })

  return NextResponse.json({ conversation })
}
