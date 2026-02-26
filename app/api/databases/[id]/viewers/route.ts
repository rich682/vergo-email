/**
 * Database Viewers API
 *
 * GET  /api/databases/[id]/viewers - List current viewers
 * PUT  /api/databases/[id]/viewers - Set viewers (replaces full list)
 *
 * Requires databases:manage permission.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseService } from "@/lib/services/database.service"
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "databases:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { id } = await params

    const db = await prisma.database.findFirst({
      where: { id, organizationId: session.user.organizationId },
      select: { id: true },
    })

    if (!db) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const viewers = await prisma.databaseViewer.findMany({
      where: { databaseId: id },
      include: {
        user: { select: { id: true, name: true, email: true } },
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
    console.error("Error fetching database viewers:", error)
    return NextResponse.json({ error: "Failed to fetch database viewers" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "databases:manage", session.user.orgActionPermissions)) {
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
      return NextResponse.json({ error: "userIds must be an array" }, { status: 400 })
    }

    if (userIds.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: { id: { in: userIds }, organizationId: session.user.organizationId },
        select: { id: true },
      })
      const validUserIds = new Set(validUsers.map((u) => u.id))
      const invalidIds = userIds.filter((uid) => !validUserIds.has(uid))
      if (invalidIds.length > 0) {
        return NextResponse.json({ error: `Invalid user IDs: ${invalidIds.join(", ")}` }, { status: 400 })
      }
    }

    const viewers = await DatabaseService.setViewers(id, session.user.organizationId, userIds, session.user.id)

    return NextResponse.json({
      viewers: viewers.map((v) => ({
        userId: v.user.id,
        name: v.user.name,
        email: v.user.email,
        addedAt: v.addedAt,
      })),
    })
  } catch (error: any) {
    console.error("Error setting database viewers:", error)
    if (error.message === "Database not found") {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to set database viewers" }, { status: 500 })
  }
}
