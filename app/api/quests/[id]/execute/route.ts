/**
 * Quest Execute Endpoint
 *
 * POST /api/quests/[id]/execute - Execute a quest (send emails)
 *
 * Accepts optional edited subject/body to update the draft before sending.
 * When subject/body are provided, the quest status is transitioned to "ready"
 * to allow immediate execution (used by Item-initiated Send Request flow).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { QuestService } from "@/lib/services/quest.service"
import { EmailDraftService } from "@/lib/services/email-draft.service"
import { canPerformAction } from "@/lib/permissions"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized", errorCode: "ORG_ACCESS_DENIED" },
        { status: 401 }
      )
    }

    if (!canPerformAction(session.user.role, "inbox:send_emails", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to send emails" }, { status: 403 })
    }

    const organizationId = session.user.organizationId
    const { id } = await params

    // Parse request body for optional edits and attachments
    let editedSubject: string | undefined
    let editedBody: string | undefined
    let attachments: Array<{ filename: string; content: string; contentType: string }> | undefined
    
    try {
      const body = await request.json()
      editedSubject = body.subject
      editedBody = body.body
      attachments = body.attachments
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

    // Execute quest with attachments
    const result = await QuestService.execute(id, organizationId, { attachments })

    return NextResponse.json({
      success: result.success,
      emailsSent: result.emailsSent,
      taskIds: result.taskIds,
      errors: result.errors
    })

  } catch (error: any) {
    console.error("Quest execute error:", error)
    
    // Map known error messages to error codes
    let errorCode = "UNKNOWN"
    const errorMessage = error.message || ""
    
    if (errorMessage.includes("Quest not found")) {
      errorCode = "ORG_ACCESS_DENIED"
    } else if (errorMessage.includes("not ready for execution")) {
      errorCode = "QUEST_NOT_READY"
    } else if (errorMessage.includes("No recipients")) {
      errorCode = "NO_VALID_RECIPIENTS"
    } else if (errorMessage.includes("No active email account")) {
      errorCode = "SENDER_NOT_CONNECTED"
    } else if (errorMessage.includes("No refresh token") || errorMessage.includes("No access token") || errorMessage.includes("token expired")) {
      errorCode = "SENDER_NOT_CONNECTED"
    } else if (errorMessage.includes("Gmail") || errorMessage.includes("SMTP") || errorMessage.includes("email provider") || errorMessage.includes("401") || errorMessage.includes("403")) {
      errorCode = "PROVIDER_SEND_FAILED"
    }
    
    return NextResponse.json(
      { error: "Failed to execute quest", errorCode },
      { status: 500 }
    )
  }
}
