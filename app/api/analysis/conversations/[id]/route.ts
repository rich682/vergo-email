/**
 * Analysis Conversation Detail API
 *
 * GET    — Get conversation with messages
 * DELETE — Delete conversation
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:view", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const conversation = await prisma.analysisConversation.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
      userId: session.user.id,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  return NextResponse.json({ conversation })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:manage", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const conversation = await prisma.analysisConversation.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
      userId: session.user.id,
    },
  })

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  await prisma.analysisConversation.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
