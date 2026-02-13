/**
 * Quest Interpretation Endpoint
 *
 * POST /api/quests/interpret
 *
 * Translates natural language prompts into structured Quest intent.
 * Returns recipient selection criteria (semantic labels), schedule intent,
 * reminder configuration, and resolved recipient counts.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { QuestInterpreterService } from "@/lib/services/quest-interpreter.service"
import { canPerformAction } from "@/lib/permissions"
import type { QuestInterpretRequest } from "@/lib/types/quest"

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId

    if (!canPerformAction(session.user.role, "inbox:manage_quests", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage quests" }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { prompt } = body as QuestInterpretRequest

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    // Interpret the prompt
    const result = await QuestInterpreterService.interpret(organizationId, { prompt })

    // Get organization context for recipient resolution
    const context = await QuestInterpreterService.getOrganizationContext(organizationId)

    // Resolve recipients for preview
    const recipients = await QuestInterpreterService.resolveRecipientsForPreview(
      organizationId,
      result.recipientSelection,
      context
    )

    // Log interpretation for debugging
    console.log(JSON.stringify({
      event: "quest_interpretation",
      organizationId,
      promptLength: prompt.length,
      confidence: result.confidence,
      recipientCount: result.resolvedCounts.matchingRecipients,
      warningCount: result.warnings.length,
      timestamp: new Date().toISOString()
    }))

    return NextResponse.json({
      success: true,
      interpretation: result,
      recipients
    })

  } catch (error: any) {
    console.error("Quest interpretation error:", error)
    
    return NextResponse.json(
      { error: "Failed to interpret request" },
      { status: 500 }
    )
  }
}

// GET endpoint for checking availability
export async function GET() {
  return NextResponse.json({
    enabled: true,
    feature: "QUEST_AI_INTERPRETER"
  })
}
