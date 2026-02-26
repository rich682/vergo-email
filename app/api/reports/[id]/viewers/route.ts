/**
 * Report Definition Viewers API
 *
 * GET  /api/reports/[id]/viewers - List current viewers
 * PUT  /api/reports/[id]/viewers - Set viewers (replaces full list)
 *
 * Requires reports:manage permission.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportDefinitionService } from "@/lib/services/report-definition.service"
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Require reports:manage permission
    if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { id } = await params

    // Verify report exists and belongs to org
    const report = await prisma.reportDefinition.findFirst({
      where: { id, organizationId: session.user.organizationId },
      select: { id: true },
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Get viewers
    const viewers = await prisma.reportDefinitionViewer.findMany({
      where: { reportDefinitionId: id },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { addedAt: "asc" },
    })

    return NextResponse.json({
      viewers: viewers.map((v) => ({
        userId: v.user.id,
        name: v.user.name,
        email: v.user.email,
        addedAt: v.addedAt,
      })),
    })
  } catch (error) {
    console.error("Error fetching report viewers:", error)
    return NextResponse.json(
      { error: "Failed to fetch report viewers" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Require reports:manage permission
    if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { id } = await params

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { userIds } = body as { userIds?: string[] }

    if (!Array.isArray(userIds)) {
      return NextResponse.json(
        { error: "userIds must be an array of user IDs" },
        { status: 400 }
      )
    }

    // Validate all user IDs belong to this organization
    if (userIds.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: {
          id: { in: userIds },
          organizationId: session.user.organizationId,
        },
        select: { id: true },
      })

      const validUserIds = new Set(validUsers.map((u) => u.id))
      const invalidIds = userIds.filter((id) => !validUserIds.has(id))

      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `Invalid user IDs: ${invalidIds.join(", ")}` },
          { status: 400 }
        )
      }
    }

    // Set viewers (replaces full list)
    const viewers = await ReportDefinitionService.setViewers(
      id,
      session.user.organizationId,
      userIds,
      session.user.id
    )

    return NextResponse.json({
      viewers: viewers.map((v) => ({
        userId: v.user.id,
        name: v.user.name,
        email: v.user.email,
        addedAt: v.addedAt,
      })),
    })
  } catch (error: any) {
    console.error("Error setting report viewers:", error)

    if (error.message === "Report definition not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to set report viewers" },
      { status: 500 }
    )
  }
}
