/**
 * Quest Context Endpoint
 * 
 * GET /api/quests/context - Get organization context for Quest UI
 * 
 * Returns available contact types, groups, and state keys for the organization.
 * Used to populate dropdowns in the confirmation card.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { QuestInterpreterService } from "@/lib/services/quest-interpreter.service"

export async function GET(request: NextRequest) {
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

    // Get organization context
    const context = await QuestInterpreterService.getOrganizationContext(organizationId)

    return NextResponse.json({
      success: true,
      contactTypes: context.availableContactTypes,
      groups: context.availableGroups,
      stateKeys: context.availableStateKeys,
      standingQuestsEnabled: true
    })

  } catch (error: any) {
    console.error("Quest context error:", error)
    return NextResponse.json(
      { error: "Failed to get context" },
      { status: 500 }
    )
  }
}
