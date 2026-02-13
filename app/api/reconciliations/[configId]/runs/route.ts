/**
 * GET /api/reconciliations/[configId]/runs - List runs
 * POST /api/reconciliations/[configId]/runs - Create new run
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationService } from "@/lib/services/reconciliation.service"
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: Promise<{ configId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:view_runs", session.user.orgActionPermissions)) {
      return NextResponse.json({ runs: [] })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Non-admin must be a viewer of the config
    const isAdmin = session.user.role === "ADMIN"
    if (!isAdmin) {
      const isViewer = await ReconciliationService.isViewer(configId, session.user.id)
      if (!isViewer) {
        return NextResponse.json(
          { error: "You do not have viewer access to this reconciliation" },
          { status: 403 }
        )
      }
    }

    const runs = await ReconciliationService.listRuns(configId, user.organizationId)
    return NextResponse.json({ runs })
  } catch (error) {
    console.error("[Reconciliations] Error listing runs:", error)
    return NextResponse.json({ error: "Failed to list runs" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to create reconciliation runs" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const body = await request.json().catch((e) => { console.warn("[JSON Parse] Failed to parse request body:", e?.message); return {} })

    const run = await ReconciliationService.createRun({
      organizationId: user.organizationId,
      configId,
      boardId: body.boardId,
      taskInstanceId: body.taskInstanceId,
    })

    return NextResponse.json({ run }, { status: 201 })
  } catch (error) {
    console.error("[Reconciliations] Error creating run:", error)
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 })
  }
}
