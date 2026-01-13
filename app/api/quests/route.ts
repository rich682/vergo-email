/**
 * Quest List and Create Endpoint
 * 
 * GET /api/quests - List all quests for the organization
 * POST /api/quests - Create a new quest from confirmed interpretation
 * 
 * Feature Flag: QUEST_UI
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { QuestService } from "@/lib/services/quest.service"
import type { QuestCreateInput, QuestInterpretationResult } from "@/lib/types/quest"

// Feature flag check
function isQuestUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_QUEST_UI === "true"
}

export async function GET(request: NextRequest) {
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
    const userId = session.user.id

    // Get quests for the organization
    const quests = await QuestService.findByOrganization(organizationId, userId)

    return NextResponse.json({
      success: true,
      quests: quests.map(q => ({
        id: q.id,
        originalPrompt: q.originalPrompt,
        status: q.status,
        questType: q.questType,
        confirmedSelection: q.confirmedSelection,
        scheduleConfig: q.scheduleConfig,
        createdAt: q.createdAt.toISOString(),
        executedAt: q.executedAt?.toISOString()
      }))
    })

  } catch (error: any) {
    console.error("Quest list error:", error)
    return NextResponse.json(
      { error: "Failed to list quests", message: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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
    const userId = session.user.id

    // Parse request body
    const body = await request.json()
    const {
      originalPrompt,
      interpretation,
      userModifications,
      confirmedSchedule,
      confirmedReminders
    } = body as {
      originalPrompt: string
      interpretation: QuestInterpretationResult
      userModifications?: any
      confirmedSchedule?: any
      confirmedReminders?: any
    }

    if (!originalPrompt || !interpretation) {
      return NextResponse.json(
        { error: "originalPrompt and interpretation are required" },
        { status: 400 }
      )
    }

    // Create quest
    const input: QuestCreateInput = {
      organizationId,
      userId,
      originalPrompt,
      interpretation,
      userModifications,
      confirmedSchedule,
      confirmedReminders
    }

    const quest = await QuestService.createFromInterpretation(input)

    return NextResponse.json({
      success: true,
      quest: {
        id: quest.id,
        originalPrompt: quest.originalPrompt,
        status: quest.status,
        questType: quest.questType,
        confirmedSelection: quest.confirmedSelection,
        scheduleConfig: quest.scheduleConfig,
        createdAt: quest.createdAt.toISOString()
      }
    })

  } catch (error: any) {
    console.error("Quest create error:", error)
    return NextResponse.json(
      { error: "Failed to create quest", message: error.message },
      { status: 500 }
    )
  }
}
