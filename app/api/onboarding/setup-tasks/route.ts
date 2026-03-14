/**
 * POST /api/onboarding/setup-tasks - Batch create tasks for new user activation
 *
 * Creates up to 5 tasks on the current month's board and marks onboarding as complete.
 * Tasks are propagated to future monthly boards automatically.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { BoardService } from "@/lib/services/board.service"
import { BoardCadence } from "@prisma/client"

const VALID_TASK_TYPES = ["reconciliation", "report", "analysis"] as const

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id

    // Prevent double creation
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true },
    })
    if (user?.onboardingCompleted) {
      return NextResponse.json(
        { error: "Onboarding already completed" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { tasks } = body

    // Validate tasks array
    if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 5) {
      return NextResponse.json(
        { error: "Provide between 1 and 5 tasks" },
        { status: 400 }
      )
    }

    for (const task of tasks) {
      if (!task.name || typeof task.name !== "string" || task.name.trim().length === 0) {
        return NextResponse.json(
          { error: "Each task must have a name" },
          { status: 400 }
        )
      }
      if (!VALID_TASK_TYPES.includes(task.taskType)) {
        return NextResponse.json(
          { error: `Invalid task type: ${task.taskType}` },
          { status: 400 }
        )
      }
    }

    // Fetch org settings
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true, fiscalYearStartMonth: true, features: true },
    })

    const orgFeatures = (organization?.features as Record<string, any>) || {}
    const advancedBoardTypes = orgFeatures.advancedBoardTypes === true

    // Ensure fiscal year boards exist (simplified mode)
    if (!advancedBoardTypes) {
      await BoardService.generateFiscalYearBoards(
        organizationId,
        organization?.fiscalYearStartMonth ?? 1,
        organization?.timezone ?? "UTC",
        userId
      )
    }

    // Find current month's board
    const now = new Date()
    const periodStartFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    const periodStartTo = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))

    const currentBoard = await prisma.board.findFirst({
      where: {
        organizationId,
        periodStart: { gte: periodStartFrom, lt: periodStartTo },
        ...(advancedBoardTypes ? {} : { cadence: "MONTHLY" as BoardCadence }),
      },
      select: { id: true },
      orderBy: { periodStart: "asc" },
    })

    if (!currentBoard) {
      return NextResponse.json(
        { error: "Could not find or create the current month board" },
        { status: 500 }
      )
    }

    // Create tasks and mark onboarding complete in a transaction
    const createdTasks = await prisma.$transaction(async (tx) => {
      const created = []
      for (const task of tasks) {
        const instance = await tx.taskInstance.create({
          data: {
            organizationId,
            ownerId: userId,
            name: task.name.trim(),
            boardId: currentBoard.id,
            taskType: task.taskType,
            status: "NOT_STARTED",
          },
        })
        created.push(instance)
      }

      await tx.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true, onboardingDismissed: true },
      })

      return created
    })

    // Propagate tasks to future boards (non-critical, outside transaction)
    if (!advancedBoardTypes) {
      for (const task of createdTasks) {
        BoardService.propagateTaskToFutureBoards(
          task.id,
          currentBoard.id,
          organizationId
        ).catch((err) => {
          console.error("[Onboarding] Error propagating task:", err)
        })
      }
    }

    return NextResponse.json({
      success: true,
      taskIds: createdTasks.map((t) => t.id),
      boardId: currentBoard.id,
    }, { status: 201 })

  } catch (error: any) {
    console.error("[Onboarding] setup-tasks error:", error)
    return NextResponse.json(
      { error: "Failed to create tasks" },
      { status: 500 }
    )
  }
}
