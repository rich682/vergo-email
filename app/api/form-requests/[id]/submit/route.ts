/**
 * Form Submission API Endpoint
 * 
 * POST /api/form-requests/[id]/submit - Submit form response
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { FormRequestService } from "@/lib/services/form-request.service"

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
