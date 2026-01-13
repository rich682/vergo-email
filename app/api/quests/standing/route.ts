/**
 * Standing Quest Create Endpoint
 * 
 * POST /api/quests/standing - Create a new standing (recurring) quest
 * 
 * Feature Flags: QUEST_UI and QUEST_STANDING
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { QuestService } from "@/lib/services/quest.service"
import type { QuestCreateInput, QuestInterpretationResult, StandingQuestSchedule } from "@/lib/types/quest"

// Feature flag checks
function isQuestUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_QUEST_UI === "true"
}

function isStandingQuestsEnabled(): boolean {
  return process.env.QUEST_STANDING === "true"
}

export async function POST(request: NextRequest) {
  // Check feature flags
  if (!isQuestUIEnabled()) {
    return NextResponse.json(
      { error: "Quest UI is not enabled" },
      { status: 404 }
    )
  }

  if (!isStandingQuestsEnabled()) {
    return NextResponse.json(
      { error: "Standing quests are not enabled" },
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
      confirmedReminders,
      standingSchedule
    } = body as {
      originalPrompt: string
      interpretation: QuestInterpretationResult
      userModifications?: any
      confirmedSchedule?: any
      confirmedReminders?: any
      standingSchedule: StandingQuestSchedule
    }

    if (!originalPrompt || !interpretation || !standingSchedule) {
      return NextResponse.json(
        { error: "originalPrompt, interpretation, and standingSchedule are required" },
        { status: 400 }
      )
    }

    // Validate standing schedule
    if (!standingSchedule.frequency || !standingSchedule.timeOfDay || !standingSchedule.timezone) {
      return NextResponse.json(
        { error: "Standing schedule must include frequency, timeOfDay, and timezone" },
        { status: 400 }
      )
    }

    // Create standing quest
    const input: QuestCreateInput & { standingSchedule: StandingQuestSchedule } = {
      organizationId,
      userId,
      originalPrompt,
      interpretation,
      userModifications,
      confirmedSchedule,
      confirmedReminders,
      standingSchedule
    }

    const quest = await QuestService.createStandingQuest(input)

    // Log standing quest creation
    console.log(JSON.stringify({
      event: "standing_quest_created",
      questId: quest.id,
      organizationId,
      frequency: standingSchedule.frequency,
      dayOfWeek: standingSchedule.dayOfWeek,
      timeOfDay: standingSchedule.timeOfDay,
      timezone: standingSchedule.timezone,
      timestamp: new Date().toISOString()
    }))

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
    console.error("Standing quest create error:", error)
    return NextResponse.json(
      { error: "Failed to create standing quest", message: error.message },
      { status: 500 }
    )
  }
}
