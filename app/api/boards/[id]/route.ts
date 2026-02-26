import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardService, derivePeriodEnd, normalizePeriodStart } from "@/lib/services/board.service"
import { BoardStatus, BoardCadence } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { inngest } from "@/inngest/client"
import { isAdmin as checkIsAdmin, canPerformAction } from "@/lib/permissions"

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
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role
    const boardId = params.id

    const { searchParams } = new URL(request.url)
    const includeJobs = searchParams.get("includeJobs") === "true"

    console.log("[API] GET /api/boards/[id]", { boardId, includeJobs })
    const board = includeJobs
      ? await BoardService.getByIdWithJobs(boardId, organizationId)
      : await BoardService.getById(boardId, organizationId)

    if (!board) {
      console.warn("[API] GET /api/boards/[id] — board not found", { boardId })
      return NextResponse.json({ error: "Board not found" }, { status: 404 })
    }

    // Access check: users with boards:view_all see all, others must be owner or collaborator
    // Fetch org features in parallel with access checks
    const hasFullAccess = canPerformAction(userRole, "boards:view_all", session.user.orgActionPermissions)

    // Run access checks + org features fetch in parallel
    const [accessResult, org] = await Promise.all([
      // Access check (only if needed)
      hasFullAccess
        ? Promise.resolve({ granted: true })
        : (async () => {
            const isOwner = board.ownerId === userId
            if (isOwner) return { granted: true }
            // Run collaborator + task access checks in parallel
            const [isCollaborator, hasTaskAccess] = await Promise.all([
              prisma.boardCollaborator.findUnique({
                where: { boardId_userId: { boardId, userId } }
              }),
              prisma.taskInstance.findFirst({
                where: {
                  boardId,
                  organizationId,
                  OR: [
                    { ownerId: userId },
                    { collaborators: { some: { userId } } }
                  ]
                },
                select: { id: true }
              })
            ])
            return { granted: !!(isCollaborator || hasTaskAccess) }
          })(),
      // Org features fetch (always needed)
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { features: true },
      })
    ])

    if (!accessResult.granted) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const orgFeatures = (org?.features as Record<string, any>) || {}
    const advancedBoardTypes = orgFeatures.advancedBoardTypes === true

    return NextResponse.json({ board, advancedBoardTypes })
  } catch (error: any) {
    console.error("[API/boards/[id]] Error getting board:", error)
    return NextResponse.json(
      { error: "Failed to get board", code: error.code, meta: error.meta },
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
    const userRole = session.user.role
    const boardId = params.id

    // Fetch board for access check + status comparison (single fetch, reused below)
    const currentBoard = await BoardService.getById(boardId, organizationId)
    if (!currentBoard) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 })
    }

    // Access check: admins can modify any board, owners can edit their own, others need boards:manage
    if (!checkIsAdmin(userRole)) {
      const isOwner = currentBoard.ownerId === userId
      if (!isOwner) {
        // Non-owners need boards:manage permission
        if (!canPerformAction(session.user.role, "boards:manage", session.user.orgActionPermissions)) {
          return NextResponse.json({ error: "You do not have permission to edit boards" }, { status: 403 })
        }
      }
      // Owners can always edit their own boards (same pattern as tasks:edit_any)
    }

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

    // Parallelize: duplicate name check + org fiscal year fetch
    const [duplicateBoard, organization] = await Promise.all([
      (name && typeof name === "string" && name.trim())
        ? prisma.board.findFirst({
            where: { organizationId, name: name.trim(), id: { not: boardId } },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { fiscalYearStartMonth: true }
      })
    ])

    if (duplicateBoard) {
      return NextResponse.json(
        { error: `A board with the name "${name.trim()}" already exists` },
        { status: 409 }
      )
    }

    const fiscalYearStartMonth = organization?.fiscalYearStartMonth ?? 1

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
        finalPeriodStart = normalizePeriodStart(effectiveCadence as BoardCadence, parsedStart, { fiscalYearStartMonth }) || parsedStart

        // Derive periodEnd server-side
        const derivedEnd = derivePeriodEnd(effectiveCadence as BoardCadence, finalPeriodStart, { fiscalYearStartMonth })
        finalPeriodEnd = derivedEnd || (periodEnd ? new Date(periodEnd) : null)
      }
    } else if (periodEnd !== undefined) {
      // Only periodEnd provided without periodStart - just pass it through
      finalPeriodEnd = periodEnd ? new Date(periodEnd) : null
    }

    // Check if we need to trigger auto-creation (status changing to COMPLETE)
    let shouldTriggerAutomation = false
    if (status === "COMPLETE") {
      if (currentBoard && currentBoard.status !== "COMPLETE") {
        shouldTriggerAutomation = true
      }
    }

    // Determine closedAt based on status change
    let closedAt: Date | null | undefined = undefined
    if (status) {
      const closedStatuses = ["CLOSED", "COMPLETE"]
      const wasClosedBefore = currentBoard && closedStatuses.includes(currentBoard.status)
      const isClosedNow = closedStatuses.includes(status)

      if (isClosedNow && !wasClosedBefore) {
        // Transitioning to a closed status — stamp the close time
        closedAt = new Date()
      } else if (!isClosedNow && wasClosedBefore) {
        // Reopening — clear the close time
        closedAt = null
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
        skipWeekends,
        closedAt,
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

    // Emit workflow trigger on board status change
    if (status && shouldTriggerAutomation) {
      try {
        await inngest.send({
          name: "workflow/trigger",
          data: {
            triggerType: "board_status_changed",
            triggerEventId: boardId,
            organizationId,
            metadata: {
              boardId,
              status,
              cadence: board.cadence,
              periodStart: board.periodStart?.toISOString(),
              periodEnd: board.periodEnd?.toISOString(),
              triggeredBy: userId,
            },
          },
        })
      } catch (triggerError) {
        console.error("[API/boards/[id]] Failed to emit workflow trigger:", triggerError)
      }
    }

    return NextResponse.json({ board, nextBoard })
  } catch (error: any) {
    console.error("[API/boards/[id]] Error updating board:", error)
    
    if (error.message === "Board not found") {
      return NextResponse.json({ error: "Board not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to update board" },
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
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role
    const boardId = params.id

    if (!canPerformAction(session.user.role, "boards:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to delete boards" }, { status: 403 })
    }

    // Access check: admins can delete any board, others must be owner
    if (!checkIsAdmin(userRole)) {
      const existingBoard = await BoardService.getById(boardId, organizationId)
      if (!existingBoard) {
        return NextResponse.json({ error: "Board not found" }, { status: 404 })
      }
      if (existingBoard.ownerId !== userId) {
        return NextResponse.json({ error: "Access denied - only owner or admin can delete this board" }, { status: 403 })
      }
    }

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

    if (error.message?.includes("Cannot delete board with jobs")) {
      return NextResponse.json(
        { error: "Cannot delete board with existing jobs. Remove jobs first." },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Failed to delete board" },
      { status: 500 }
    )
  }
}
