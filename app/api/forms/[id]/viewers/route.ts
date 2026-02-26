/**
 * Form Definition Viewers API
 *
 * GET  /api/forms/[id]/viewers - List current viewers
 * PUT  /api/forms/[id]/viewers - Set viewers (replaces full list)
 *
 * Requires forms:manage permission.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { FormDefinitionService } from "@/lib/services/form-definition.service"
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

    if (!canPerformAction(session.user.role, "forms:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { id } = await params

    const form = await prisma.formDefinition.findFirst({
      where: { id, organizationId: session.user.organizationId },
      select: { id: true },
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    const viewers = await prisma.formDefinitionViewer.findMany({
      where: { formDefinitionId: id },
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
    console.error("Error fetching form viewers:", error)
    return NextResponse.json({ error: "Failed to fetch form viewers" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "forms:manage", session.user.orgActionPermissions)) {
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

    const viewers = await FormDefinitionService.setViewers(id, session.user.organizationId, userIds, session.user.id)

    return NextResponse.json({
      viewers: viewers.map((v) => ({
        userId: v.user.id,
        name: v.user.name,
        email: v.user.email,
        addedAt: v.addedAt,
      })),
    })
  } catch (error: any) {
    console.error("Error setting form viewers:", error)
    if (error.message === "Form definition not found") {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to set form viewers" }, { status: 500 })
  }
}
