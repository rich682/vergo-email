/**
 * Quest List and Create Endpoint
 * 
 * GET /api/quests - List all quests for the organization
 * POST /api/quests - Create a new quest from confirmed interpretation
 * 
 * Feature Flag: QUEST_UI (bypassed when jobId is provided for Item-initiated requests)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
      { error: "Quest UI is not enabled", errorCode: "QUEST_UI_DISABLED" },
      { status: 404 }
    )
  }

  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized", errorCode: "ORG_ACCESS_DENIED" },
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
      { error: "Failed to list quests", errorCode: "UNKNOWN", message: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Parse request body first to check for jobId (allows bypassing feature flag)
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", errorCode: "INVALID_REQUEST_PAYLOAD" },
      { status: 400 }
    )
  }

  const {
    originalPrompt,
    interpretation,
    userModifications,
    confirmedSchedule,
    confirmedReminders,
    jobId  // Optional: parent Job for Request-level association
  } = body as {
    originalPrompt: string
    interpretation: QuestInterpretationResult
    userModifications?: any
    confirmedSchedule?: any
    confirmedReminders?: any
    jobId?: string | null
  }

  // Check feature flag - bypass if jobId is provided (Item-initiated request)
  if (!isQuestUIEnabled() && !jobId) {
    return NextResponse.json(
      { error: "Quest UI is not enabled", errorCode: "QUEST_UI_DISABLED" },
      { status: 404 }
    )
  }

  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized", errorCode: "ORG_ACCESS_DENIED" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = (session.user as any).id

    if (!userId) {
      console.error("Quest create error: userId is missing from session", { session })
      return NextResponse.json(
        { error: "User ID not found in session", errorCode: "ORG_ACCESS_DENIED" },
        { status: 401 }
      )
    }

    if (!originalPrompt || !interpretation) {
      return NextResponse.json(
        { error: "originalPrompt and interpretation are required", errorCode: "INVALID_REQUEST_PAYLOAD" },
        { status: 400 }
      )
    }

    // Validate jobId if provided (must belong to same organization)
    if (jobId) {
      const job = await prisma.job.findFirst({
        where: { id: jobId, organizationId },
        select: { id: true }
      })
      if (!job) {
        return NextResponse.json(
          { error: "Job not found or does not belong to this organization", errorCode: "ORG_ACCESS_DENIED" },
          { status: 400 }
        )
      }
    }

    // Create quest
    // When jobId is provided with immediate send timing, set initialStatus to "ready"
    // so the quest can be executed immediately without going through the confirmation flow
    const isImmediateSend = confirmedSchedule?.sendTiming === "immediate"
    const initialStatus = (jobId && isImmediateSend) ? "ready" : undefined

    const input: QuestCreateInput = {
      organizationId,
      userId,
      jobId: jobId || null,  // Pass jobId to persist at creation time
      originalPrompt,
      interpretation,
      userModifications,
      confirmedSchedule,
      confirmedReminders,
      initialStatus  // Set to "ready" for Item-initiated immediate sends
    }

    console.log(`Quest create: Creating quest for org ${organizationId}, user ${userId}, jobId: ${jobId || 'none'}, initialStatus: ${initialStatus || 'default'}`)
    
    const quest = await QuestService.createFromInterpretation(input)

    console.log(`Quest create: Created quest ${quest.id}, status: ${quest.status}`)

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
      { error: "Failed to create quest", errorCode: "UNKNOWN", message: error.message },
      { status: 500 }
    )
  }
}
