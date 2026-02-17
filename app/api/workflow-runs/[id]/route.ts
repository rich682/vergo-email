/**
 * GET /api/workflow-runs/[id] — Get workflow run status and step results
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
  if (!session?.user?.organizationId || !session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const organizationId = session.user.organizationId

  if (!canPerformAction(session.user.role as any, "agents:view" as any, session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const run = await prisma.workflowRun.findFirst({
    where: { id, organizationId },
    include: {
      automationRule: {
        select: { id: true, name: true, trigger: true },
      },
      auditLogs: {
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!run) {
    return NextResponse.json({ error: "Workflow run not found" }, { status: 404 })
  }

  return NextResponse.json({ run })
}
