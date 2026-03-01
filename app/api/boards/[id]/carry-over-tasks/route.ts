/**
 * Board - Carry Over Tasks
 *
 * POST /api/boards/[id]/carry-over-tasks
 * Manually carry over tasks from a previous period board to this board.
 * Useful for catching up when the new board was created before the previous board received all its tasks.
 *
 * Body: { sourceBoardId: string }
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

    const { sourceBoardId } = await request.json()

    if (!sourceBoardId || typeof sourceBoardId !== "string") {
      return NextResponse.json(
        { error: "sourceBoardId is required" },
        { status: 400 }
      )
    }

    const targetBoardId = params.id
    const organizationId = session.user.organizationId

    // Verify both boards exist and belong to this organization
    const [targetBoard, sourceBoard] = await Promise.all([
      prisma.board.findUnique({
        where: { id: targetBoardId },
        select: { id: true, organizationId: true, name: true }
      }),
      prisma.board.findUnique({
        where: { id: sourceBoardId },
        select: { id: true, organizationId: true, name: true }
      })
    ])

    if (!targetBoard || targetBoard.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Target board not found" },
        { status: 404 }
      )
    }

    if (!sourceBoard || sourceBoard.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Source board not found" },
        { status: 404 }
      )
    }

    // Get all task instances from source board
    const sourceInstances = await prisma.taskInstance.findMany({
      where: { boardId: sourceBoardId, organizationId },
      include: {
        collaborators: true,
        taskInstanceLabels: { include: { contactLabels: true } },
      }
    })

    console.log(
      `[CarryOverTasks] Carrying over ${sourceInstances.length} tasks from "${sourceBoard.name}" to "${targetBoard.name}"`
    )

    let tasksCarriedOver = 0

    // Create instances in target board, skipping any that already exist (by lineageId)
    for (const source of sourceInstances) {
      // Check if this task already exists in the target board (by lineageId)
      const existingTask = source.lineageId
        ? await prisma.taskInstance.findFirst({
            where: {
              boardId: targetBoardId,
              lineageId: source.lineageId,
              organizationId
            }
          })
        : null

      if (existingTask) {
        console.log(
          `[CarryOverTasks] Skipping task "${source.name}" - already exists in target board`
        )
        continue
      }

      // Create new task instance in target board
      const sourceAny = source as any
      const newInstance = await prisma.taskInstance.create({
        data: {
          organizationId,
          boardId: targetBoardId,
          lineageId: source.lineageId,
          name: source.name,
          description: source.description,
          ownerId: source.ownerId,
          clientId: source.clientId,
          status: "NOT_STARTED",
          customFields: source.customFields,
          labels: source.labels,
          taskType: sourceAny.taskType || null,
          reconciliationConfigId: sourceAny.reconciliationConfigId || null,
          reportDefinitionId: sourceAny.reportDefinitionId || null,
          reportFilterBindings: sourceAny.reportFilterBindings || null,
        }
      })

      // Copy collaborators
      if (source.collaborators.length > 0) {
        await prisma.taskInstanceCollaborator.createMany({
          data: source.collaborators.map(c => ({
            taskInstanceId: newInstance.id,
            userId: c.userId,
            role: c.role,
            addedBy: c.addedBy
          }))
        })
      }

      tasksCarriedOver++
      console.log(`[CarryOverTasks] Created task "${source.name}" in target board`)
    }

    return NextResponse.json({
      success: true,
      message: `Carried over ${tasksCarriedOver} tasks from "${sourceBoard.name}" to "${targetBoard.name}"`,
      tasksCarriedOver,
      sourceBoard,
      targetBoard
    })
  } catch (error) {
    console.error("Error carrying over tasks:", error)
    return NextResponse.json(
      { error: "Failed to carry over tasks" },
      { status: 500 }
    )
  }
}
