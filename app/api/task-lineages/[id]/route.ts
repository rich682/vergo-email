import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskLineageService } from "@/lib/services/task-lineage.service"
import { canPerformAction } from "@/lib/permissions"

/**
 * GET /api/task-lineages/[id]
 * Fetch a single lineage by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId } = await params
    const organizationId = session.user.organizationId

    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId },
      include: {
        instances: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            name: true,
            status: true,
            isSnapshot: true,
            createdAt: true,
            board: {
              select: { id: true, name: true, periodStart: true }
            }
          }
        },
        importRecipes: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    return NextResponse.json({ lineage })
  } catch (error: any) {
    console.error("Error fetching lineage:", error)
    return NextResponse.json(
      { error: "Failed to fetch lineage" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/task-lineages/[id]
 * Update lineage metadata (name, description)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId } = await params
    const organizationId = session.user.organizationId

    if (!canPerformAction(session.user.role, "tasks:edit_any", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to edit task lineages" }, { status: 403 })
    }

    const body = await request.json()

    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId }
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    const { name, description } = body
    const updateData: any = {}

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description

    const updatedLineage = await prisma.taskLineage.update({
      where: { id: lineageId },
      data: updateData
    })

    return NextResponse.json({ lineage: updatedLineage })
  } catch (error: any) {
    console.error("Error updating lineage:", error)
    return NextResponse.json(
      { error: "Failed to update lineage" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/task-lineages/[id]
 * Delete a lineage (only if it has no instances)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId } = await params
    const organizationId = session.user.organizationId

    if (!canPerformAction(session.user.role, "tasks:delete", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to delete task lineages" }, { status: 403 })
    }

    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId },
      include: { _count: { select: { instances: true } } }
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    if (lineage._count.instances > 0) {
      return NextResponse.json(
        { error: "Cannot delete lineage with existing instances", code: "HAS_INSTANCES" },
        { status: 400 }
      )
    }

    await prisma.taskLineage.delete({
      where: { id: lineageId }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting lineage:", error)
    return NextResponse.json(
      { error: "Failed to delete lineage" },
      { status: 500 }
    )
  }
}
