import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskStatus } from "@prisma/client"

// Note: Request model is @@map("Task") in Prisma schema, so prisma.request maps to Task table

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const task = await prisma.request.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId
    },
    include: {
      entity: true,
      messages: {
        where: {
          direction: "OUTBOUND"
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 1,
        select: {
          openedAt: true,
          openedCount: true,
          lastOpenedAt: true
        }
      }
    }
  })

  if (!task) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }

  const latestOutboundMessage = task.messages[0] || null
  const taskWithReadReceipt = {
    ...task,
    isOpened: latestOutboundMessage?.openedAt ? true : false,
    openedAt: latestOutboundMessage?.openedAt || null,
    openedCount: latestOutboundMessage?.openedCount || 0,
    lastOpenedAt: latestOutboundMessage?.lastOpenedAt || null
  }

  return NextResponse.json(taskWithReadReceipt)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { status } = body

    // Validate status - support all TaskStatus values plus CLEAR alias
    const validStatuses = [
      "AWAITING_RESPONSE",
      "IN_PROGRESS",
      "REPLIED",
      "HAS_ATTACHMENTS",
      "VERIFYING",
      "FULFILLED",
      "REJECTED",
      "FLAGGED",
      "MANUAL_REVIEW",
      "ON_HOLD",
      "CLEAR" // Alias for AWAITING_RESPONSE
    ]
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    // Check if task exists and belongs to user's organization
    const task = await prisma.request.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId
      }
    })

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Map CLEAR to AWAITING_RESPONSE, otherwise use the provided status
    const newStatus: TaskStatus = status === "CLEAR" ? "AWAITING_RESPONSE" : status as TaskStatus

    // Update task status
    const updatedTask = await prisma.request.update({
      where: { id: params.id },
      data: { status: newStatus },
      include: {
        entity: true
      }
    })

    return NextResponse.json({
      success: true,
      task: updatedTask
    })
  } catch (error: any) {
    console.error('[API /tasks/[id] PATCH] Error:', error)
    return NextResponse.json(
      { error: error.message || "Failed to update task status" },
      { status: 500 }
    )
  }
}

