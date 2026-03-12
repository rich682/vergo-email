/**
 * Review Hub Count API
 *
 * GET /api/review-hub/count - Get pending review item counts for sidebar badge
 *
 * Returns counts by type, respecting feature flag and cross-module permissions.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { organizationId } = session.user
    const permissions = session.user.orgActionPermissions

    // Check review:view permission
    if (!canPerformAction(session.user.role, "review:view", permissions)) {
      return NextResponse.json({ total: 0, byType: {} })
    }

    // Check feature flag
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { features: true },
    })
    const features = (org?.features as Record<string, any>) || {}
    if (!features.reviewHub) {
      return NextResponse.json({ total: 0, byType: {} })
    }

    // Run parallel count queries, gated by underlying module permissions
    const counts: Record<string, number> = {}

    const queries: Promise<void>[] = []

    // Agent outputs: completed workflow runs not yet reviewed
    if (canPerformAction(session.user.role, "agents:view", permissions)) {
      queries.push(
        prisma.workflowRun.count({
          where: {
            organizationId,
            status: "COMPLETED",
            reviewedAt: null,
          },
        }).then(c => { counts.agent_output = c })
      )
    }

    // Email replies: inbound unreviewed messages
    if (canPerformAction(session.user.role, "inbox:review", permissions)) {
      queries.push(
        prisma.message.count({
          where: {
            direction: "INBOUND",
            reviewStatus: "UNREVIEWED",
            isAutoReply: false,
            request: { organizationId },
          },
        }).then(c => { counts.email_reply = c })
      )
    }

    // Form submissions: submitted but not reviewed
    if (canPerformAction(session.user.role, "forms:view_submissions", permissions)) {
      queries.push(
        prisma.formRequest.count({
          where: {
            organizationId,
            status: "SUBMITTED",
            reviewedAt: null,
          },
        }).then(c => { counts.form_submission = c })
      )
    }

    // Evidence: unreviewed collected items
    if (canPerformAction(session.user.role, "collection:view_all", permissions)) {
      queries.push(
        prisma.collectedItem.count({
          where: {
            organizationId,
            status: "UNREVIEWED",
          },
        }).then(c => { counts.evidence = c })
      )
    }

    await Promise.all(queries)

    const total = Object.values(counts).reduce((sum, c) => sum + c, 0)

    return NextResponse.json({ total, byType: counts })
  } catch (error: any) {
    console.error("[ReviewHub] Count error:", error)
    return NextResponse.json({ total: 0, byType: {} })
  }
}
