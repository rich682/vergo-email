/**
 * Single Cell Value API
 * 
 * GET /api/task-lineages/[id]/app-columns/[columnId]/values/[rowIdentity] - Get cell value
 * PATCH /api/task-lineages/[id]/app-columns/[columnId]/values/[rowIdentity] - Update cell value
 * DELETE /api/task-lineages/[id]/app-columns/[columnId]/values/[rowIdentity] - Clear cell value
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteParams = {
  id: string
  columnId: string
  rowIdentity: string
}

/**
 * GET /api/task-lineages/[id]/app-columns/[columnId]/values/[rowIdentity]
 * Get a single cell value
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, columnId, rowIdentity: encodedRowIdentity } = await params
    const rowIdentity = decodeURIComponent(encodedRowIdentity)
    const { organizationId } = session.user

    // Verify column exists
    const column = await prisma.appColumnDefinition.findFirst({
      where: { id: columnId, lineageId, organizationId },
    })

    if (!column) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 })
    }

    // Get value
    const value = await prisma.appColumnValue.findUnique({
      where: {
        columnId_rowIdentity: { columnId, rowIdentity },
      },
      include: {
        updatedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    if (!value) {
      return NextResponse.json({
        value: null,
        column,
      })
    }

    return NextResponse.json({
      value: {
        id: value.id,
        value: value.value,
        updatedAt: value.updatedAt,
        updatedBy: value.updatedBy,
      },
      column,
    })
  } catch (error: unknown) {
    console.error("Error getting cell value:", error)
    const message = error instanceof Error ? error.message : "Failed to get value"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/task-lineages/[id]/app-columns/[columnId]/values/[rowIdentity]
 * Update a single cell value
 * 
 * Body:
 * - value: any (type depends on column dataType)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, columnId, rowIdentity: encodedRowIdentity } = await params
    const rowIdentity = decodeURIComponent(encodedRowIdentity)
    const { organizationId } = session.user
    const userId = session.user.id
    const body = await request.json()

    const { value } = body

    // Verify column exists
    const column = await prisma.appColumnDefinition.findFirst({
      where: { id: columnId, lineageId, organizationId },
    })

    if (!column) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 })
    }

    // Type-specific validation
    if (column.dataType === "status" && value) {
      const statusValue = value as { statusKey?: string }
      if (statusValue.statusKey) {
        const config = column.config as { options?: Array<{ key: string }> }
        const validKeys = config?.options?.map((o) => o.key) || []
        if (!validKeys.includes(statusValue.statusKey)) {
          return NextResponse.json(
            { error: `Invalid status key: ${statusValue.statusKey}` },
            { status: 400 }
          )
        }
      }
    }

    // Upsert the value
    const result = await prisma.appColumnValue.upsert({
      where: {
        columnId_rowIdentity: { columnId, rowIdentity },
      },
      update: {
        value,
        updatedById: userId,
      },
      create: {
        organizationId,
        columnId,
        rowIdentity,
        value,
        updatedById: userId,
      },
      include: {
        updatedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json({
      value: {
        id: result.id,
        value: result.value,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
      },
    })
  } catch (error: unknown) {
    console.error("Error updating cell value:", error)
    const message = error instanceof Error ? error.message : "Failed to update value"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/task-lineages/[id]/app-columns/[columnId]/values/[rowIdentity]
 * Clear a cell value
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, columnId, rowIdentity: encodedRowIdentity } = await params
    const rowIdentity = decodeURIComponent(encodedRowIdentity)
    const { organizationId } = session.user

    // Verify column exists
    const column = await prisma.appColumnDefinition.findFirst({
      where: { id: columnId, lineageId, organizationId },
    })

    if (!column) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 })
    }

    // Delete the value if it exists
    const existing = await prisma.appColumnValue.findUnique({
      where: {
        columnId_rowIdentity: { columnId, rowIdentity },
      },
    })

    if (existing) {
      await prisma.appColumnValue.delete({
        where: { id: existing.id },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting cell value:", error)
    const message = error instanceof Error ? error.message : "Failed to delete value"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
