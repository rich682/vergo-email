/**
 * App Column Detail API
 * 
 * GET /api/task-lineages/[id]/app-columns/[columnId] - Get a single column
 * PATCH /api/task-lineages/[id]/app-columns/[columnId] - Update column (label, config, position)
 * DELETE /api/task-lineages/[id]/app-columns/[columnId] - Delete column and all its values
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/task-lineages/[id]/app-columns/[columnId]
 * Get a single app column
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, columnId } = await params
    const { organizationId } = session.user

    const column = await prisma.appColumnDefinition.findFirst({
      where: { id: columnId, lineageId, organizationId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { values: true },
        },
      },
    })

    if (!column) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 })
    }

    return NextResponse.json({ column })
  } catch (error: unknown) {
    console.error("Error getting app column:", error)
    const message = error instanceof Error ? error.message : "Failed to get column"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/task-lineages/[id]/app-columns/[columnId]
 * Update column label, config, or position
 * 
 * Body (all optional):
 * - label: string
 * - config: object (for status columns: { options: [{key, label, color}] })
 * - position: number
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, columnId } = await params
    const { organizationId } = session.user
    const body = await request.json()

    const { label, config, position } = body as {
      label?: string
      config?: Record<string, unknown>
      position?: number
    }

    // Find the column
    const existingColumn = await prisma.appColumnDefinition.findFirst({
      where: { id: columnId, lineageId, organizationId },
    })

    if (!existingColumn) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 })
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (label !== undefined) {
      if (!label.trim()) {
        return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 })
      }
      updateData.label = label.trim()
    }

    if (config !== undefined) {
      // Validate config for status columns
      if (existingColumn.dataType === "status" && config.options) {
        const options = config.options as Array<{ key: string; label: string; color: string }>
        if (!Array.isArray(options) || options.length === 0) {
          return NextResponse.json(
            { error: "Status columns require at least one option" },
            { status: 400 }
          )
        }
        for (const opt of options) {
          if (!opt.key || !opt.label) {
            return NextResponse.json(
              { error: "Each status option requires key and label" },
              { status: 400 }
            )
          }
        }
      }
      updateData.config = config
    }

    if (position !== undefined) {
      // Handle position reordering
      const oldPosition = existingColumn.position
      const newPosition = position

      if (oldPosition !== newPosition) {
        // Shift other columns
        if (newPosition > oldPosition) {
          // Moving down: shift columns between old and new up
          await prisma.appColumnDefinition.updateMany({
            where: {
              lineageId,
              organizationId,
              position: { gt: oldPosition, lte: newPosition },
            },
            data: { position: { decrement: 1 } },
          })
        } else {
          // Moving up: shift columns between new and old down
          await prisma.appColumnDefinition.updateMany({
            where: {
              lineageId,
              organizationId,
              position: { gte: newPosition, lt: oldPosition },
            },
            data: { position: { increment: 1 } },
          })
        }
        updateData.position = newPosition
      }
    }

    // Update the column
    const updatedColumn = await prisma.appColumnDefinition.update({
      where: { id: columnId },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json({ column: updatedColumn })
  } catch (error: unknown) {
    console.error("Error updating app column:", error)
    const message = error instanceof Error ? error.message : "Failed to update column"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/task-lineages/[id]/app-columns/[columnId]
 * Delete a column and all its values
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, columnId } = await params
    const { organizationId } = session.user

    // Find the column
    const column = await prisma.appColumnDefinition.findFirst({
      where: { id: columnId, lineageId, organizationId },
    })

    if (!column) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 })
    }

    // Delete column (values cascade due to onDelete: Cascade)
    await prisma.$transaction(async (tx) => {
      // Shift positions of columns after the deleted one
      await tx.appColumnDefinition.updateMany({
        where: {
          lineageId,
          organizationId,
          position: { gt: column.position },
        },
        data: { position: { decrement: 1 } },
      })

      // Delete the column
      await tx.appColumnDefinition.delete({
        where: { id: columnId },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting app column:", error)
    const message = error instanceof Error ? error.message : "Failed to delete column"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
