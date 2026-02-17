/**
 * Form Submission API Endpoint
 * 
 * POST /api/form-requests/[id]/submit - Submit form response
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { FormRequestService } from "@/lib/services/form-request.service"
import { NotificationService } from "@/lib/services/notification.service"
import { inngest } from "@/inngest/client"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { responseData } = body

    if (!responseData || typeof responseData !== "object") {
      return NextResponse.json(
        { error: "responseData is required" },
        { status: 400 }
      )
    }

    const updated = await FormRequestService.submit(
      id,
      session.user.id,
      responseData
    )

    // Notify task participants about the form submission (non-blocking)
    if (updated.taskInstanceId) {
      const actorName = session.user.name || "Someone"
      const formName = (updated as any).formDefinition?.name || "a form"
      NotificationService.notifyTaskParticipants(
        updated.taskInstanceId,
        session.user.organizationId,
        session.user.id,
        "form_response",
        `${actorName} submitted "${formName}"`,
        `A form response has been submitted.`,
        { formRequestId: updated.id }
      ).catch((err) => console.error("Failed to send form response notifications:", err))
    }

    // Emit workflow trigger for form_submitted
    try {
      await inngest.send({
        name: "workflow/trigger",
        data: {
          triggerType: "form_submitted",
          triggerEventId: updated.id,
          organizationId: session.user.organizationId,
          metadata: {
            formRequestId: updated.id,
            formDefinitionId: (updated as any).formDefinitionId || null,
            taskInstanceId: updated.taskInstanceId || null,
            submittedBy: session.user.id,
          },
        },
      })
    } catch (triggerError) {
      console.error("[FormSubmit] Failed to emit workflow trigger:", triggerError)
    }

    return NextResponse.json({
      success: true,
      formRequest: updated,
    })
  } catch (error: any) {
    console.error("Error submitting form:", error)

    // Handle specific errors
    if (error.message?.includes("not found") || error.message?.includes("access denied")) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }
    if (error.message?.includes("already been submitted")) {
      return NextResponse.json({ error: "Form has already been submitted" }, { status: 400 })
    }
    if (error.message?.includes("required")) {
      return NextResponse.json({ error: "Required fields are missing" }, { status: 400 })
    }

    return NextResponse.json(
      { error: "Failed to submit form" },
      { status: 500 }
    )
  }
}
