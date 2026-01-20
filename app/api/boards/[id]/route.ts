import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardService, derivePeriodEnd, normalizePeriodStart } from "@/lib/services/board.service"
import { BoardStatus, BoardCadence } from "@prisma/client"

export const dynamic = "force-dynamic"

const VALID_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "BLOCKED", "ARCHIVED", "OPEN", "CLOSED"]
const VALID_CADENCES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEAR_END", "AD_HOC"]

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
 * 
 * Body:
 * - name?: string
 * - description?: string | null
 * - status?: BoardStatus (if changed to COMPLETE, may trigger auto-creation of next board)
 * - ownerId?: string
 * - cadence?: BoardCadence | null
 * - periodStart?: ISO date string | null
 * - periodEnd?: ISO date string | null (optional - derived server-side if cadence provided)
 * - collaboratorIds?: string[]
 * - automationEnabled?: boolean
 * - skipWeekends?: boolean
 * 
 * Response:
 * - board: The updated board
 * - nextBoard?: The auto-created next period board (if status changed to COMPLETE and automation enabled)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const boardId = params.id
    const body = await request.json()

    const { 
      name, 
      description, 
      status, 
      ownerId, 
      cadence, 
      periodStart, 
      periodEnd, 
      collaboratorIds,
      automationEnabled,
      skipWeekends
    } = body

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate cadence if provided
    if (cadence && !VALID_CADENCES.includes(cadence)) {
      return NextResponse.json(
        { error: `Invalid cadence. Must be one of: ${VALID_CADENCES.join(", ")}` },
        { status: 400 }
      )
    }

    // Period fields are now optional - no validation requirement

    // Process period dates with server-side derivation
    let finalPeriodStart: Date | null | undefined = undefined
    let finalPeriodEnd: Date | null | undefined = undefined

    if (periodStart !== undefined) {
      if (periodStart === null) {
        finalPeriodStart = null
        finalPeriodEnd = null
      } else {
        const parsedStart = new Date(periodStart)
        // Normalize the start date based on cadence
        const effectiveCadence = cadence !== undefined ? cadence : undefined
        finalPeriodStart = normalizePeriodStart(effectiveCadence as BoardCadence, parsedStart) || parsedStart
        
        // Derive periodEnd server-side
        const derivedEnd = derivePeriodEnd(effectiveCadence as BoardCadence, finalPeriodStart)
        finalPeriodEnd = derivedEnd || (periodEnd ? new Date(periodEnd) : null)
      }
    } else if (periodEnd !== undefined) {
      // Only periodEnd provided without periodStart - just pass it through
      finalPeriodEnd = periodEnd ? new Date(periodEnd) : null
    }

    // Check if we need to trigger auto-creation (status changing to COMPLETE)
    let shouldTriggerAutomation = false
    if (status === "COMPLETE") {
      // Get current board to check if this is actually a status change
      const currentBoard = await BoardService.getById(boardId, organizationId)
      if (currentBoard && currentBoard.status !== "COMPLETE") {
        shouldTriggerAutomation = true
      }
    }

    const board = await BoardService.update(
      boardId, 
      organizationId, 
      {
        name: name?.trim(),
        description: description !== undefined ? description?.trim() || null : undefined,
        status: status as BoardStatus | undefined,
        ownerId,
        cadence: cadence !== undefined ? cadence as BoardCadence | null : undefined,
        periodStart: finalPeriodStart,
        periodEnd: finalPeriodEnd,
        collaboratorIds,
        automationEnabled,
        skipWeekends
      },
      userId
    )

    // Trigger auto-creation of next period board if applicable
    let nextBoard = null
    if (shouldTriggerAutomation) {
      try {
        nextBoard = await BoardService.createNextPeriodBoard(
          boardId,
          organizationId,
          userId
        )
      } catch (autoCreateError: any) {
        // Log but don't fail the request - the board was still updated successfully
        console.error("[API/boards/[id]] Error auto-creating next board:", autoCreateError)
      }
    }

    return NextResponse.json({ board, nextBoard })
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
