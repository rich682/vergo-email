/**
 * TaskInstances API Endpoints
 * 
 * GET /api/task-instances - List task instances for organization
 * POST /api/task-instances - Create a new task instance
 * 
 * Feature Flag: JOBS_UI (for UI visibility, API always available)
 * 
 * Role-Based Access:
 * - ADMIN: Sees all task instances, can use "My Tasks" filter
 * - MEMBER: Only sees task instances they own or collaborate on
 * - VIEWER: Read-only access to owned/collaborated task instances (cannot create)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { BoardService } from "@/lib/services/board.service"
import { JobStatus } from "@prisma/client"
import { canPerformAction } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role as string | undefined
    const { searchParams } = new URL(request.url)
    
    const status = searchParams.get("status") as JobStatus | null
    const clientId = searchParams.get("clientId")
    const boardId = searchParams.get("boardId")  // Filter by board
    const myTasks = searchParams.get("myTasks") === "true" || searchParams.get("myJobs") === "true"
    const ownerId = searchParams.get("ownerId")
    const tagsParam = searchParams.get("tags")  // Comma-separated tags filter
    const includeArchived = searchParams.get("includeArchived") === "true"
    const limit = searchParams.get("limit")
    const offset = searchParams.get("offset")

    // Parse tags filter
    const tags = tagsParam ? tagsParam.split(",").map(t => t.trim()).filter(Boolean) : undefined

    const result = await TaskInstanceService.findByOrganization(organizationId, {
      userId,  // Pass for role-based filtering
      userRole,  // Pass for role-based filtering
      orgActionPermissions: session.user.orgActionPermissions,
      status: status || undefined,
      clientId: clientId || undefined,
      boardId: boardId || undefined,
      ownerId: myTasks ? userId : (ownerId || undefined),
      collaboratorId: myTasks ? userId : undefined,
      tags,
      includeArchived,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined
    })

    // Map instances to include effective status (custom status takes precedence)
    const instancesWithEffectiveStatus = result.taskInstances.map(instance => {
      const labels = instance.labels as any
      const customStatus = labels?.customStatus || null
      return {
        ...instance,
        status: customStatus || instance.status
      }
    })

    return NextResponse.json({
      success: true,
      taskInstances: instancesWithEffectiveStatus,
      total: result.total
    })

  } catch (error: any) {
    console.error("TaskInstances list error:", error)
    return NextResponse.json(
      { error: "Failed to list task instances", code: error.code, meta: error.meta },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    if (!canPerformAction(session.user.role, "tasks:create", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to create tasks" }, { status: 403 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const body = await request.json()

    const {
      name,
      description,
      clientId,
      dueDate,
      labels,
      tags,
      ownerId,
      boardId,
      lineageId
    } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Item name is required" },
        { status: 400 }
      )
    }

    // Create the TaskInstance
    const taskInstance = await TaskInstanceService.create({
      organizationId,
      ownerId: ownerId || userId,
      name: name.trim(),
      description: description?.trim() || undefined,
      clientId: clientId || undefined,
      boardId: boardId || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labels: labels || undefined,
      tags: tags || undefined,
      lineageId: lineageId || undefined
    })

    return NextResponse.json({
      success: true,
      taskInstance
    }, { status: 201 })

  } catch (error: any) {
    console.error("TaskInstance create error:", error)
    return NextResponse.json(
      { error: "Failed to create task instance" },
      { status: 500 }
    )
  }
}
