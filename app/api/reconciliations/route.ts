/**
 * GET /api/reconciliations - List all reconciliation configs for the org
 * POST /api/reconciliations - Create a new reconciliation config
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationService } from "@/lib/services/reconciliation.service"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const configs = await ReconciliationService.listConfigs(user.organizationId)
    return NextResponse.json({ configs })
  } catch (error) {
    console.error("[Reconciliations] Error listing configs:", error)
    return NextResponse.json({ error: "Failed to list reconciliations" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true, role: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const body = await request.json()
    const { taskInstanceId, name, sourceAConfig, sourceBConfig, matchingRules } = body

    if (!taskInstanceId || !name) {
      return NextResponse.json({ error: "taskInstanceId and name are required" }, { status: 400 })
    }

    // Verify the task belongs to this org
    const task = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId: user.organizationId },
    })
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const config = await ReconciliationService.createConfig({
      organizationId: user.organizationId,
      taskInstanceId,
      name,
      sourceAConfig: sourceAConfig || { label: "Source A", columns: [] },
      sourceBConfig: sourceBConfig || { label: "Source B", columns: [] },
      matchingRules: matchingRules || {
        amountMatch: "exact",
        dateWindowDays: 3,
        fuzzyDescription: true,
      },
    })

    return NextResponse.json({ config }, { status: 201 })
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "This task already has a reconciliation configured" }, { status: 409 })
    }
    console.error("[Reconciliations] Error creating config:", error)
    return NextResponse.json({ error: "Failed to create reconciliation" }, { status: 500 })
  }
}
