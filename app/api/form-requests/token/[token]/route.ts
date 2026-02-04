/**
 * Token-Based Form Request API Endpoint
 * 
 * GET /api/form-requests/token/[token] - Get form request details (no auth required)
 * POST /api/form-requests/token/[token] - Submit form response (no auth required)
 * 
 * Used by external stakeholders who don't have login accounts.
 */

import { NextRequest, NextResponse } from "next/server"
import { FormRequestService } from "@/lib/services/form-request.service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    const formRequest = await FormRequestService.findByToken(token)

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found or invalid token" }, { status: 404 })
    }

    // Get recipient info from either user or entity
    const recipient = formRequest.recipientUser 
      ? {
          id: formRequest.recipientUser.id,
          name: formRequest.recipientUser.name,
          email: formRequest.recipientUser.email,
        }
      : formRequest.recipientEntity
      ? {
          id: formRequest.recipientEntity.id,
          name: formRequest.recipientEntity.firstName + 
            (formRequest.recipientEntity.lastName ? ` ${formRequest.recipientEntity.lastName}` : ""),
          email: formRequest.recipientEntity.email,
        }
      : null

    // Return form request data in a normalized format
    return NextResponse.json({ 
      formRequest: {
        id: formRequest.id,
        status: formRequest.status,
        submittedAt: formRequest.submittedAt,
        deadlineDate: formRequest.deadlineDate,
        responseData: formRequest.responseData,
        formDefinition: formRequest.formDefinition,
        taskInstance: formRequest.taskInstance,
        recipientUser: recipient, // Normalized to same format
      }
    })
  } catch (error: any) {
    console.error("Error fetching form request by token:", error)
    return NextResponse.json(
      { error: "Failed to fetch form request", message: error.message },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    const body = await request.json()
    const { responseData } = body

    if (!responseData || typeof responseData !== "object") {
      return NextResponse.json({ error: "responseData is required" }, { status: 400 })
    }

    const result = await FormRequestService.submitByToken(token, responseData)

    return NextResponse.json({ 
      success: true,
      formRequest: result,
    })
  } catch (error: any) {
    console.error("Error submitting form by token:", error)
    return NextResponse.json(
      { error: "Failed to submit form", message: error.message },
      { status: 500 }
    )
  }
}
