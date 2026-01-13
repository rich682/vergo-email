/**
 * Quest Execute Endpoint
 * 
 * POST /api/quests/[id]/execute - Execute a quest (send emails)
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

    // Execute quest
    const result = await QuestService.execute(id, organizationId)

    return NextResponse.json({
      success: result.success,
      emailsSent: result.emailsSent,
      taskIds: result.taskIds,
      errors: result.errors
    })

  } catch (error: any) {
    console.error("Quest execute error:", error)
    return NextResponse.json(
      { error: "Failed to execute quest", message: error.message },
      { status: 500 }
    )
  }
}
