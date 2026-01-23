/**
 * Single App Row API
 * 
 * GET /api/task-lineages/[id]/app-rows/[rowId] - Get a single app row
 * PATCH /api/task-lineages/[id]/app-rows/[rowId] - Update an app row
 * DELETE /api/task-lineages/[id]/app-rows/[rowId] - Delete an app row
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/task-lineages/[id]/app-rows/[rowId]
 * Get a single app row with its values
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, rowId } = await params
    const { organizationId } = session.user

    const row = await prisma.appRowDefinition.findFirst({
      where: { id: rowId, lineageId, organizationId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        values: true,
      },
    })

    if (!row) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 })
    }

    return NextResponse.json({ row })
  } catch (error: unknown) {
    console.error("Error getting app row:", error)
    const message = error instanceof Error ? error.message : "Failed to get row"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/task-lineages/[id]/app-rows/[rowId]
 * Update an app row
 * 
 * Body (all optional):
 * - label: string
 * - position: number
 * - formula: object
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, rowId } = await params
    const { organizationId } = session.user
    const body = await request.json()

    // Verify row exists and belongs to org
    const existingRow = await prisma.appRowDefinition.findFirst({
      where: { id: rowId, lineageId, organizationId },
    })

    if (!existingRow) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 })
    }

    const { label, position, formula } = body as {
      label?: string
      position?: number
      formula?: Record<string, unknown>
    }

    const updateData: Record<string, unknown> = {}
    if (label !== undefined) updateData.label = label.trim()
    if (position !== undefined) updateData.position = position
    if (formula !== undefined) updateData.formula = formula

    const row = await prisma.appRowDefinition.update({
      where: { id: rowId },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        values: true,
      },
    })

    return NextResponse.json({ row })
  } catch (error: unknown) {
    console.error("Error updating app row:", error)
    const message = error instanceof Error ? error.message : "Failed to update row"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/task-lineages/[id]/app-rows/[rowId]
 * Delete an app row (cascades to values)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, rowId } = await params
    const { organizationId } = session.user

    // Verify row exists and belongs to org
    const existingRow = await prisma.appRowDefinition.findFirst({
      where: { id: rowId, lineageId, organizationId },
    })

    if (!existingRow) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 })
    }

    await prisma.appRowDefinition.delete({
      where: { id: rowId },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting app row:", error)
    const message = error instanceof Error ? error.message : "Failed to delete row"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
