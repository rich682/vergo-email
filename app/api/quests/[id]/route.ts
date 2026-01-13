/**
 * Quest Detail Endpoint
 * 
 * GET /api/quests/[id] - Get quest details
 * PATCH /api/quests/[id] - Update quest selection
 * 
 * Feature Flag: QUEST_UI
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { QuestService } from "@/lib/services/quest.service"

// Feature flag check
function isQuestUIEnabled(): boolean {
  return process.env.QUEST_UI === "true"
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check feature flag
  if (!isQuestUIEnabled()) {
    return NextResponse.json(
      { error: "Quest UI is not enabled" },
      { status: 404 }
    )
  }

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
    const { id } = await params

    // Get quest
    const quest = await QuestService.findById(id, organizationId)
    if (!quest) {
      return NextResponse.json(
        { error: "Quest not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      quest: {
        id: quest.id,
        originalPrompt: quest.originalPrompt,
        status: quest.status,
        questType: quest.questType,
        confirmedSelection: quest.confirmedSelection,
        scheduleConfig: quest.scheduleConfig,
        remindersConfig: quest.remindersConfig,
        subject: quest.subject,
        body: quest.body,
        htmlBody: quest.htmlBody,
        createdAt: quest.createdAt.toISOString(),
        confirmedAt: quest.confirmedAt?.toISOString(),
        executedAt: quest.executedAt?.toISOString()
      }
    })

  } catch (error: any) {
    console.error("Quest get error:", error)
    return NextResponse.json(
      { error: "Failed to get quest", message: error.message },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check feature flag
  if (!isQuestUIEnabled()) {
    return NextResponse.json(
      { error: "Quest UI is not enabled" },
      { status: 404 }
    )
  }

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
    const { id } = await params

    // Parse request body
    const body = await request.json()
    const { confirmedSelection } = body

    if (!confirmedSelection) {
      return NextResponse.json(
        { error: "confirmedSelection is required" },
        { status: 400 }
      )
    }

    // Update quest
    const quest = await QuestService.updateSelection(id, organizationId, confirmedSelection)

    return NextResponse.json({
      success: true,
      quest: {
        id: quest.id,
        originalPrompt: quest.originalPrompt,
        status: quest.status,
        confirmedSelection: quest.confirmedSelection
      }
    })

  } catch (error: any) {
    console.error("Quest update error:", error)
    return NextResponse.json(
      { error: "Failed to update quest", message: error.message },
      { status: 500 }
    )
  }
}
