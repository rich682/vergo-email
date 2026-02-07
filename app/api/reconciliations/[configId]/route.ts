/**
 * GET /api/reconciliations/[configId] - Get config details + runs
 * PATCH /api/reconciliations/[configId] - Update config
 * DELETE /api/reconciliations/[configId] - Delete config
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationService } from "@/lib/services/reconciliation.service"

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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const config = await ReconciliationService.getConfig(configId, user.organizationId)
    if (!config) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 })
    }

    return NextResponse.json({ config })
  } catch (error) {
    console.error("[Reconciliations] Error getting config:", error)
    return NextResponse.json({ error: "Failed to get reconciliation" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId } = await params
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

    const body = await request.json()
    await ReconciliationService.updateConfig(configId, user.organizationId, body)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Reconciliations] Error updating config:", error)
    return NextResponse.json({ error: "Failed to update reconciliation" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { configId } = await params
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

    await ReconciliationService.deleteConfig(configId, user.organizationId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Reconciliations] Error deleting config:", error)
    return NextResponse.json({ error: "Failed to delete reconciliation" }, { status: 500 })
  }
}
