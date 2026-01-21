import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TaskInstanceLabelService, MetadataFieldSchema } from "@/lib/services/task-instance-label.service"
import { prisma } from "@/lib/prisma"

// GET /api/task-instances/[id]/labels - List all labels for a task instance
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: taskInstanceId } = await params
    const organizationId = session.user.organizationId

    // Verify task instance belongs to organization
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
    })

    if (!instance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    const labels = await TaskInstanceLabelService.getLabelsForInstance(taskInstanceId)

    // Include stats
    const stats = await TaskInstanceLabelService.getLabelStats(taskInstanceId)
    const statsMap = new Map(stats.map((s) => [s.labelId, s.count]))

    const labelsWithStats = labels.map((label) => ({
      ...label,
      metadataSchema: label.metadataSchema as MetadataFieldSchema[],
      contactCount: statsMap.get(label.id) || 0,
    }))

    return NextResponse.json({
      success: true,
      labels: labelsWithStats,
    })
  } catch (error: any) {
    console.error("List labels error:", error)
    return NextResponse.json(
      { error: "Failed to list labels", message: error.message },
      { status: 500 }
    )
  }
}

// POST /api/task-instances/[id]/labels - Create a new label
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: taskInstanceId } = await params
    const organizationId = session.user.organizationId

    // Verify task instance belongs to organization
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
    })

    if (!instance) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { name, color, metadataSchema } = body as {
      name: string
      color?: string
      metadataSchema?: MetadataFieldSchema[]
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Label name is required" },
        { status: 400 }
      )
    }

    // Validate metadataSchema if provided
    if (metadataSchema) {
      if (!Array.isArray(metadataSchema)) {
        return NextResponse.json(
          { error: "metadataSchema must be an array" },
          { status: 400 }
        )
      }

      for (const field of metadataSchema) {
        if (!field.key || !field.label || !field.type) {
          return NextResponse.json(
            { error: "Each metadata field must have key, label, and type" },
            { status: 400 }
          )
        }
        if (!["text", "number", "date", "currency"].includes(field.type)) {
          return NextResponse.json(
            { error: `Invalid field type: ${field.type}` },
            { status: 400 }
          )
        }
      }
    }

    const label = await TaskInstanceLabelService.createLabel({
      taskInstanceId,
      organizationId,
      name,
      color,
      metadataSchema,
    })

    return NextResponse.json({
      success: true,
      label: {
        ...label,
        metadataSchema: label.metadataSchema as MetadataFieldSchema[],
        contactCount: 0,
      },
    })
  } catch (error: any) {
    console.error("Create label error:", error)

    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A label with this name already exists for this item" },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: "Failed to create label", message: error.message },
      { status: 500 }
    )
  }
}
