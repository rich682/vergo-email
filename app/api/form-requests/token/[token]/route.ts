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
import { checkRateLimit } from "@/lib/utils/rate-limit"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate limit by IP to prevent token enumeration
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const rateCheck = await checkRateLimit(`form-token:${ip}`, 30)
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

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
    
    // Normalize JSON fields
    const normalizedFormDefinition = {
      id: formRequest.formDefinition.id,
      name: formRequest.formDefinition.name,
      description: formRequest.formDefinition.description,
      fields: safeParseJson(formRequest.formDefinition.fields, []),
      settings: safeParseJson(formRequest.formDefinition.settings, {}),
      columnMapping: safeParseJson(formRequest.formDefinition.columnMapping, {}),
      databaseId: formRequest.formDefinition.databaseId,
    }

    // Return form request data in a normalized format
    return NextResponse.json({ 
      formRequest: {
        id: formRequest.id,
        status: formRequest.status,
        submittedAt: formRequest.submittedAt,
        deadlineDate: formRequest.deadlineDate,
        responseData: safeParseJson(formRequest.responseData, {}),
        formDefinition: normalizedFormDefinition,
        taskInstance: {
          id: formRequest.taskInstance.id,
          name: formRequest.taskInstance.name,
        },
        recipientUser: recipient, // Normalized to same format
      }
    })
  } catch (error: any) {
    console.error("Error fetching form request by token:", error)
    return NextResponse.json(
      { error: "Failed to fetch form request" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate limit by IP to prevent abuse
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const rateCheck = await checkRateLimit(`form-submit:${ip}`, 10)
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

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
      { error: "Failed to submit form" },
      { status: 500 }
    )
  }
}
