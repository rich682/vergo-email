import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { SubtaskService } from "@/lib/services/subtask.service"
import { prisma } from "@/lib/prisma"
import { SubtaskStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/jobs/[id]/subtasks - List all subtasks for a job
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
    const jobId = params.id

    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const subtasks = await SubtaskService.getByJobId(jobId, organizationId)

    return NextResponse.json({ subtasks })
  } catch (error: any) {
    console.error("[API/jobs/[id]/subtasks] Error listing subtasks:", error)
    return NextResponse.json(
      { error: "Failed to list subtasks", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/jobs/[id]/subtasks - Create a new subtask
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id
    const body = await request.json()

    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const { title, description, ownerId, status, dueDate } = body

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Subtask title is required" },
        { status: 400 }
      )
    }

    // Validate status if provided
    if (status && !["NOT_STARTED", "IN_PROGRESS", "STUCK", "DONE"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      )
    }

    // Validate owner if provided
    if (ownerId) {
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

    const subtask = await SubtaskService.create({
      organizationId,
      jobId,
      title: title.trim(),
      description: description?.trim() || undefined,
      ownerId: ownerId || undefined,
      status: status as SubtaskStatus | undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined
    })

    return NextResponse.json({ subtask }, { status: 201 })
  } catch (error: any) {
    console.error("[API/jobs/[id]/subtasks] Error creating subtask:", error)
    return NextResponse.json(
      { error: "Failed to create subtask", message: error.message },
      { status: 500 }
    )
  }
}
