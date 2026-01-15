import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardService } from "@/lib/services/board.service"
import { BoardStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/boards/[id] - Get a single board with its jobs
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
    const boardId = params.id

    const { searchParams } = new URL(request.url)
    const includeJobs = searchParams.get("includeJobs") === "true"

    const board = includeJobs
      ? await BoardService.getByIdWithJobs(boardId, organizationId)
      : await BoardService.getById(boardId, organizationId)

    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 })
    }

    return NextResponse.json({ board })
  } catch (error: any) {
    console.error("[API/boards/[id]] Error getting board:", error)
    return NextResponse.json(
      { error: "Failed to get board", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/boards/[id] - Update a board
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
    const boardId = params.id
    const body = await request.json()

    const { name, description, status, periodStart, periodEnd } = body

    // Validate status if provided
    if (status && !["OPEN", "CLOSED", "ARCHIVED"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be OPEN, CLOSED, or ARCHIVED" },
        { status: 400 }
      )
    }

    const board = await BoardService.update(boardId, organizationId, {
      name: name?.trim(),
      description: description !== undefined ? description?.trim() || null : undefined,
      status: status as BoardStatus | undefined,
      periodStart: periodStart !== undefined
        ? periodStart ? new Date(periodStart) : null
        : undefined,
      periodEnd: periodEnd !== undefined
        ? periodEnd ? new Date(periodEnd) : null
        : undefined
    })

    return NextResponse.json({ board })
  } catch (error: any) {
    console.error("[API/boards/[id]] Error updating board:", error)
    
    if (error.message === "Board not found") {
      return NextResponse.json({ error: "Board not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to update board", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/boards/[id] - Archive or delete a board
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
    const boardId = params.id

    const { searchParams } = new URL(request.url)
    const hardDelete = searchParams.get("hard") === "true"

    if (hardDelete) {
      // Hard delete - only works if board has no jobs
      await BoardService.delete(boardId, organizationId)
      return NextResponse.json({ success: true, deleted: true })
    } else {
      // Soft delete - archive the board
      const board = await BoardService.archive(boardId, organizationId)
      return NextResponse.json({ success: true, board })
    }
  } catch (error: any) {
    console.error("[API/boards/[id]] Error deleting board:", error)
    
    if (error.message === "Board not found") {
      return NextResponse.json({ error: "Board not found" }, { status: 404 })
    }

    if (error.message.includes("Cannot delete board with jobs")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Failed to delete board", message: error.message },
      { status: 500 }
    )
  }
}
