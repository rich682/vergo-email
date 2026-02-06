/**
 * Accept AI Suggestion
 *
 * POST /api/requests/[id]/accept-suggestion
 *
 * Applies an AI-suggested action to a request (e.g. mark as complete).
 * Logs the acceptance in aiReasoning for audit.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: requestId } = await params
    const body = await request.json()
    const { actionType } = body // "mark_complete" | "send_followup" | "review_attachment"

    if (!actionType) {
      return NextResponse.json({ error: "actionType is required" }, { status: 400 })
    }

    // Fetch the request to verify ownership
    const req = await prisma.request.findFirst({
      where: { id: requestId, organizationId: session.user.organizationId },
      select: {
        id: true,
        status: true,
        completionPercentage: true,
        aiReasoning: true,
      },
    })

    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    const existingReasoning =
      typeof req.aiReasoning === "object" && req.aiReasoning !== null
        ? (req.aiReasoning as Record<string, any>)
        : {}

    const now = new Date().toISOString()

    // Apply the action
    switch (actionType) {
      case "mark_complete": {
        await prisma.request.update({
          where: { id: requestId },
          data: {
            status: "COMPLETE",
            aiReasoning: {
              ...existingReasoning,
              suggestionAccepted: {
                action: "mark_complete",
                completionPercentageAtAccept: req.completionPercentage,
                acceptedAt: now,
                acceptedBy: session.user.id,
              },
            },
          },
        })
        return NextResponse.json({ success: true, newStatus: "COMPLETE" })
      }

      case "review_attachment":
      case "review_reply": {
        // Mark as read so it doesn't show as "needs attention"
        await prisma.request.update({
          where: { id: requestId },
          data: {
            readStatus: "read",
            aiReasoning: {
              ...existingReasoning,
              suggestionAccepted: {
                action: actionType,
                acceptedAt: now,
                acceptedBy: session.user.id,
              },
            },
          },
        })
        return NextResponse.json({ success: true, action: "marked_read" })
      }

      default:
        return NextResponse.json({ error: "Unknown action type" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[AcceptSuggestion] Error:", error?.message)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
