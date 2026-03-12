/**
 * Review Hub Action API
 *
 * POST /api/review-hub/action - Perform inline review actions
 *
 * Body:
 *   type: "agent_output" | "email_reply" | "form_submission" | "evidence"
 *   id: string - ID of the item to act on
 *   action: "mark_reviewed" | "needs_follow_up" | "approve" | "reject"
 *   notes?: string - Optional review notes
 *   rejectionReason?: string - Required for reject action
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export const dynamic = "force-dynamic"

interface ActionRequest {
  type: "agent_output" | "email_reply" | "form_submission" | "evidence"
  id: string
  action: "mark_reviewed" | "needs_follow_up" | "approve" | "reject"
  notes?: string
  rejectionReason?: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { organizationId } = session.user
    const userId = session.user.id
    const permissions = session.user.orgActionPermissions

    // Check review:manage permission
    if (!canPerformAction(session.user.role, "review:manage", permissions)) {
      return NextResponse.json({ error: "You do not have permission to review items" }, { status: 403 })
    }

    const body: ActionRequest = await request.json()
    const { type, id, action, notes, rejectionReason } = body

    if (!type || !id || !action) {
      return NextResponse.json({ error: "Missing required fields: type, id, action" }, { status: 400 })
    }

    switch (type) {
      // ── Agent Output: mark WorkflowRun as reviewed ───────────────────────
      case "agent_output": {
        if (!canPerformAction(session.user.role, "agents:view", permissions)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        if (action !== "mark_reviewed") {
          return NextResponse.json({ error: "Invalid action for agent_output. Use: mark_reviewed" }, { status: 400 })
        }

        const run = await prisma.workflowRun.findFirst({
          where: { id, organizationId, status: "COMPLETED" },
        })
        if (!run) {
          return NextResponse.json({ error: "Workflow run not found" }, { status: 404 })
        }

        await prisma.workflowRun.update({
          where: { id },
          data: {
            reviewedAt: new Date(),
            reviewedById: userId,
            reviewNotes: notes || null,
          },
        })

        return NextResponse.json({ success: true, message: "Workflow run marked as reviewed" })
      }

      // ── Email Reply: update Message reviewStatus ─────────────────────────
      case "email_reply": {
        if (!canPerformAction(session.user.role, "inbox:review", permissions)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        if (action !== "mark_reviewed" && action !== "needs_follow_up") {
          return NextResponse.json({ error: "Invalid action for email_reply. Use: mark_reviewed, needs_follow_up" }, { status: 400 })
        }

        const message = await prisma.message.findFirst({
          where: {
            id,
            request: { organizationId },
          },
        })
        if (!message) {
          return NextResponse.json({ error: "Message not found" }, { status: 404 })
        }

        const newStatus = action === "mark_reviewed" ? "REVIEWED" : "NEEDS_FOLLOW_UP"

        await prisma.$transaction([
          prisma.message.update({
            where: { id },
            data: {
              reviewStatus: newStatus,
              reviewedAt: new Date(),
              reviewedById: userId,
              reviewNotes: notes || null,
            },
          }),
          prisma.reviewAuditLog.create({
            data: {
              messageId: id,
              userId,
              action: action === "mark_reviewed" ? "marked_reviewed" : "marked_needs_follow_up",
              metadata: notes ? { notes } : undefined,
            },
          }),
        ])

        return NextResponse.json({ success: true, message: `Message marked as ${newStatus.toLowerCase().replace("_", " ")}` })
      }

      // ── Form Submission: mark FormRequest as reviewed ────────────────────
      case "form_submission": {
        if (!canPerformAction(session.user.role, "forms:view_submissions", permissions)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        if (action !== "mark_reviewed") {
          return NextResponse.json({ error: "Invalid action for form_submission. Use: mark_reviewed" }, { status: 400 })
        }

        const formRequest = await prisma.formRequest.findFirst({
          where: { id, organizationId, status: "SUBMITTED" },
        })
        if (!formRequest) {
          return NextResponse.json({ error: "Form submission not found" }, { status: 404 })
        }

        await prisma.formRequest.update({
          where: { id },
          data: {
            reviewedAt: new Date(),
            reviewedById: userId,
            reviewNotes: notes || null,
          },
        })

        return NextResponse.json({ success: true, message: "Form submission marked as reviewed" })
      }

      // ── Evidence: mark reviewed, approve, or reject CollectedItem ────────
      case "evidence": {
        if (!canPerformAction(session.user.role, "collection:manage", permissions)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        if (action !== "mark_reviewed" && action !== "approve" && action !== "reject") {
          return NextResponse.json({ error: "Invalid action for evidence. Use: mark_reviewed, approve, reject" }, { status: 400 })
        }
        if (action === "reject" && !rejectionReason) {
          return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 })
        }

        const item = await prisma.collectedItem.findFirst({
          where: { id, organizationId, status: "UNREVIEWED" },
        })
        if (!item) {
          return NextResponse.json({ error: "Evidence item not found" }, { status: 404 })
        }

        const newStatus = action === "reject" ? "REJECTED" : "APPROVED"

        await prisma.collectedItem.update({
          where: { id },
          data: {
            status: newStatus,
            reviewedBy: userId,
            reviewedAt: new Date(),
            rejectionReason: action === "reject" ? rejectionReason : null,
          },
        })

        const actionLabel = action === "mark_reviewed" ? "marked as reviewed" : action === "approve" ? "approved" : "rejected"
        return NextResponse.json({
          success: true,
          message: `Evidence ${actionLabel}`,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[ReviewHub] Action error:", error)
    return NextResponse.json(
      { error: "Failed to perform review action" },
      { status: 500 }
    )
  }
}
