import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { SubtaskService } from "@/lib/services/subtask.service"
import { prisma } from "@/lib/prisma"
import { SubtaskStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/subtasks/[id] - Get a single subtask
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const subtaskId = params.id

    const subtask = await SubtaskService.getById(subtaskId, organizationId)

    if (!subtask) {
      return NextResponse.json({ error: "Subtask not found" }, { status: 404 })
    }

    return NextResponse.json({ subtask })
  } catch (error: any) {
    console.error("[API/subtasks/[id]] Error getting subtask:", error)
    return NextResponse.json(
      { error: "Failed to get subtask", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/subtasks/[id] - Update a subtask
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const subtaskId = params.id
    const body = await request.json()

    const { title, description, ownerId, status, dueDate, sortOrder } = body

    // Validate status if provided
    if (status && !["NOT_STARTED", "IN_PROGRESS", "STUCK", "DONE"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      )
    }

    // Validate owner if provided (null is allowed to unassign)
    if (ownerId !== undefined && ownerId !== null) {
      const owner = await prisma.user.findFirst({
        where: { id: ownerId, organizationId }
      })
      if (!owner) {
        return NextResponse.json(
          { error: "Owner not found in organization" },
          { status: 400 }
        )
      }
    }

    const subtask = await SubtaskService.update(subtaskId, organizationId, {
      title: title?.trim(),
      description: description !== undefined ? description?.trim() || null : undefined,
      ownerId: ownerId,
      status: status as SubtaskStatus | undefined,
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
      sortOrder
    })

    return NextResponse.json({ subtask })
  } catch (error: any) {
    console.error("[API/subtasks/[id]] Error updating subtask:", error)
    
    if (error.message === "Subtask not found") {
      return NextResponse.json({ error: "Subtask not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to update subtask", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/subtasks/[id] - Delete a subtask
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const subtaskId = params.id

    await SubtaskService.delete(subtaskId, organizationId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[API/subtasks/[id]] Error deleting subtask:", error)
    
    if (error.message === "Subtask not found") {
      return NextResponse.json({ error: "Subtask not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to delete subtask", message: error.message },
      { status: 500 }
    )
  }
}
