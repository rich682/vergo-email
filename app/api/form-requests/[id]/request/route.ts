/**
 * Form Request Details API Endpoint
 * 
 * GET /api/form-requests/[id]/request - Get form request details for filling
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { FormRequestService } from "@/lib/services/form-request.service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const formRequest = await FormRequestService.findById(
      id,
      session.user.organizationId
    )

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }

    // Verify the logged-in user is the recipient
    if (formRequest.recipientUserId !== session.user.id) {
      return NextResponse.json(
        { error: "You are not the intended recipient of this form" },
        { status: 403 }
      )
    }

    // Helper to safely parse JSON fields that might be strings
    const safeParseJson = (value: unknown, fallback: unknown = null) => {
      if (value === null || value === undefined) return fallback
      if (typeof value === "string") {
        try {
          return JSON.parse(value)
        } catch {
          return fallback
        }
      }
      return value
    }
    
    // Normalize JSON fields to prevent React rendering errors
    const normalizedFormRequest = {
      ...formRequest,
      responseData: safeParseJson(formRequest.responseData, {}),
      formDefinition: formRequest.formDefinition ? {
        ...formRequest.formDefinition,
        fields: safeParseJson(formRequest.formDefinition.fields, []),
        settings: safeParseJson(formRequest.formDefinition.settings, {}),
        columnMapping: safeParseJson(formRequest.formDefinition.columnMapping, {}),
      } : null,
    }

    return NextResponse.json({ formRequest: normalizedFormRequest })
  } catch (error: any) {
    console.error("Error fetching form request:", error)
    return NextResponse.json(
      { error: "Failed to fetch form request", message: error.message },
      { status: 500 }
    )
  }
}
