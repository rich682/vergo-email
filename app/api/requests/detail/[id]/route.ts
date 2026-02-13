import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskStatus } from "@prisma/client"
import { canPerformAction } from "@/lib/permissions"

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

  if (!canPerformAction(session.user.role, "requests:view", session.user.orgActionPermissions)) {
    return NextResponse.json(
      { error: "You do not have permission to view requests" },
      { status: 403 }
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

  if (!canPerformAction(session.user.role, "inbox:manage_requests", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "You do not have permission to manage requests" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { status } = body

    // Validate status - support all TaskStatus values plus CLEAR and READ aliases
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
      "CLEAR", // Alias for AWAITING_RESPONSE
      "READ",  // Virtual status: sets readStatus="read" on a REPLIED request
      "NO_REPLY", // Alias for NO_REPLY (maps to AWAITING_RESPONSE)
      "COMPLETE", // Alias for COMPLETE (maps to FULFILLED)
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

    // Handle READ virtual status -- keep DB status as REPLIED, set readStatus
    if (status === "READ") {
      const updatedTask = await prisma.request.update({
        where: { id: params.id },
        data: { 
          status: "REPLIED" as TaskStatus,
          readStatus: "read",
        },
        include: { entity: true }
      })
      return NextResponse.json({ success: true, task: updatedTask })
    }

    // Map aliases to actual enum values
    let newStatus: TaskStatus
    switch (status) {
      case "CLEAR":
      case "NO_REPLY":
        newStatus = "AWAITING_RESPONSE" as TaskStatus
        break
      case "COMPLETE":
        newStatus = "COMPLETE" as TaskStatus
        break
      default:
        newStatus = status as TaskStatus
    }

    // When changing away from READ/replied state, clear readStatus appropriately
    const readStatusUpdate = (newStatus === ("REPLIED" as TaskStatus)) 
      ? undefined  // Keep current readStatus when setting to REPLIED
      : (["AWAITING_RESPONSE", "NO_REPLY", "IN_PROGRESS"].includes(newStatus) 
        ? "unread" 
        : undefined)

    // Update task status
    const updatedTask = await prisma.request.update({
      where: { id: params.id },
      data: { 
        status: newStatus,
        ...(readStatusUpdate !== undefined ? { readStatus: readStatusUpdate } : {}),
      },
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
      { error: "Failed to update task status" },
      { status: 500 }
    )
  }
}

