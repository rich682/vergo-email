/**
 * Analysis Chat Messages API
 *
 * POST — Send a message, get LLM response with SQL execution
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions"
import { handleAnalysisChat } from "@/lib/analysis/text-to-sql"

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:query", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { message } = body as { message: string }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 })
  }

  if (message.length > 5000) {
    return NextResponse.json({ error: "Message too long (max 5000 characters)" }, { status: 400 })
  }

  try {
    const result = await handleAnalysisChat({
      conversationId: params.id,
      userMessage: message.trim(),
      organizationId: session.user.organizationId,
      userId: session.user.id,
    })

    return NextResponse.json({ message: result })
  } catch (error: any) {
    console.error("[Analysis Chat] Error:", error)

    if (error.message === "Conversation not found") {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to process your question. Please try again." },
      { status: 500 }
    )
  }
}
