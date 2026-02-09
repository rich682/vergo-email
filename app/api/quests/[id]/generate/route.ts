/**
 * Quest Generate Email Endpoint
 * 
 * POST /api/quests/[id]/generate - Generate email content for a quest
 * 
 * Feature Flag: QUEST_UI
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { QuestService } from "@/lib/services/quest.service"

// Feature flag check
function isQuestUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_QUEST_UI === "true"
}

export async function POST(
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

    console.log(`Quest generate: Starting for quest ${id}, org ${organizationId}`)

    // First check if quest exists
    const existingQuest = await QuestService.findById(id, organizationId)
    if (!existingQuest) {
      console.error(`Quest generate: Quest not found - id: ${id}, org: ${organizationId}`)
      return NextResponse.json(
        { error: "Quest not found", questId: id },
        { status: 404 }
      )
    }
    
    console.log(`Quest generate: Found quest, status: ${existingQuest.status}, userId: ${existingQuest.userId}`)

    // Generate email for quest
    const quest = await QuestService.generateEmail(id, organizationId)
    
    console.log(`Quest generate: Completed for quest ${id}, subject: ${quest.subject?.substring(0, 50)}`)

    // Get recipients with tag values for preview
    const recipientsWithTags = await QuestService.getRecipientsWithTagValues(id, organizationId)
    console.log(`Quest generate: Fetched ${recipientsWithTags.length} recipients with tag values`)

    return NextResponse.json({
      success: true,
      quest: {
        id: quest.id,
        originalPrompt: quest.originalPrompt,
        status: quest.status,
        subject: quest.subject,
        body: quest.body,
        htmlBody: quest.htmlBody,
        // Include additional data needed for preview
        confirmedSelection: quest.confirmedSelection,
        scheduleConfig: quest.scheduleConfig,
        remindersConfig: quest.remindersConfig
      },
      recipients: recipientsWithTags
    })

  } catch (error: any) {
    console.error("Quest generate error:", error)
    return NextResponse.json(
      { error: "Failed to generate email" },
      { status: 500 }
    )
  }
}
