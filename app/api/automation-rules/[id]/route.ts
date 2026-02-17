/**
 * GET /api/automation-rules/[id] — Get a single automation rule with details
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  if (!canPerformAction(session.user.role as any, "agents:view" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const { id } = await params

  const rule = await prisma.automationRule.findFirst({
    where: { id, organizationId },
    include: {
      _count: {
        select: { workflowRuns: true },
      },
      workflowRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
  })

  if (!rule) {
    return NextResponse.json({ error: "Automation rule not found" }, { status: 404 })
  }

  // Flatten lastRun from the array
  const { workflowRuns, ...rest } = rule
  const result = {
    ...rest,
    lastRun: workflowRuns[0] || null,
  }

  return NextResponse.json({ rule: result })
}
