/**
 * GET /api/workflow-runs — List workflow runs for the organization
 *
 * Query params:
 *   - status: filter by run status (PENDING, RUNNING, COMPLETED, FAILED, WAITING_APPROVAL, CANCELLED)
 *   - ruleId: filter by automation rule ID
 *   - limit: max results (default 50)
 *   - offset: pagination offset (default 0)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = session.user.organizationId

  if (!canPerformAction(session.user.role as any, "agents:view" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const ruleId = searchParams.get("ruleId")
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)
  const offset = parseInt(searchParams.get("offset") || "0", 10)

  const where: Record<string, unknown> = { organizationId }
  if (status) where.status = status
  if (ruleId) where.automationRuleId = ruleId

  const [runs, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        automationRule: {
          select: { id: true, name: true, trigger: true },
        },
      },
    }),
    prisma.workflowRun.count({ where: where as any }),
  ])

  return NextResponse.json({ runs, total, limit, offset })
}
