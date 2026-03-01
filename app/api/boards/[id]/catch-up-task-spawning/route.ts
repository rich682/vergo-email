/**
 * Board - Catch Up Task Spawning
 *
 * POST /api/boards/[id]/catch-up-task-spawning
 * Catch up on task spawning: ensures that if this board has tasks that haven't been
 * spawned to the next period yet, they get spawned now.
 *
 * Useful for handling cases where the next board was created before all tasks were
 * added to this board.
 *
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { BoardService } from "@/lib/services/board.service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const boardId = params.id
    const organizationId = session.user.organizationId

    const tasksSpawned = await BoardService.catchUpTaskSpawning(boardId, organizationId)

    if (tasksSpawned === null) {
      return NextResponse.json(
        {
          success: false,
          message: "No next period board exists, or board not found",
          tasksSpawned: 0
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Successfully spawned ${tasksSpawned} tasks to next period`,
      tasksSpawned
    })
  } catch (error) {
    console.error("Error catching up task spawning:", error)
    return NextResponse.json(
      { error: "Failed to catch up task spawning" },
      { status: 500 }
    )
  }
}
