/**
 * Quest Execute Endpoint
 * 
 * POST /api/quests/[id]/execute - Execute a quest (send emails)
 * 
 * Accepts optional edited subject/body to update the draft before sending.
 * 
 * Feature Flag: QUEST_UI
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { QuestService } from "@/lib/services/quest.service"
import { EmailDraftService } from "@/lib/services/email-draft.service"

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

    // Parse request body for optional edits
    let editedSubject: string | undefined
    let editedBody: string | undefined
    
    try {
      const body = await request.json()
      editedSubject = body.subject
      editedBody = body.body
    } catch {
      // No body or invalid JSON - that's fine, we'll use the existing content
    }

    // If user edited the content, update the draft first
    if (editedSubject || editedBody) {
      const updates: any = {}
      if (editedSubject) {
        updates.generatedSubject = editedSubject
        updates.subjectTemplate = editedSubject
      }
      if (editedBody) {
        updates.generatedBody = editedBody
        updates.bodyTemplate = editedBody
        updates.generatedHtmlBody = editedBody.replace(/\n/g, '<br>')
        updates.htmlBodyTemplate = editedBody.replace(/\n/g, '<br>')
      }
      await EmailDraftService.update(id, organizationId, updates)
    }

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
