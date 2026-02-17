/**
 * Request Template API - Get, Update, Delete
 *
 * GET    /api/request-templates/[id] - Get a single template
 * PATCH  /api/request-templates/[id] - Update a template
 * DELETE /api/request-templates/[id] - Delete a template
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "inbox:manage_quests", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const template = await prisma.requestTemplate.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId,
      },
      include: {
        createdBy: { select: { name: true, email: true } },
      },
    })

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error("Error fetching request template:", error)
    return NextResponse.json({ error: "Failed to fetch request template" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "inbox:manage_quests", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    // Verify template exists and belongs to org
    const existing = await prisma.requestTemplate.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, subjectTemplate, bodyTemplate, htmlBodyTemplate, availableTags } = body

    const template = await prisma.requestTemplate.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(subjectTemplate !== undefined && { subjectTemplate }),
        ...(bodyTemplate !== undefined && { bodyTemplate }),
        ...(htmlBodyTemplate !== undefined && { htmlBodyTemplate }),
        ...(availableTags !== undefined && { availableTags }),
      },
      include: {
        createdBy: { select: { name: true, email: true } },
      },
    })

    return NextResponse.json({ template })
  } catch (error) {
    console.error("Error updating request template:", error)
    return NextResponse.json({ error: "Failed to update request template" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "inbox:manage_quests", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const existing = await prisma.requestTemplate.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    await prisma.requestTemplate.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting request template:", error)
    return NextResponse.json({ error: "Failed to delete request template" }, { status: 500 })
  }
}
