import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TaskInstanceLabelService, MetadataFieldSchema } from "@/lib/services/task-instance-label.service"
import { prisma } from "@/lib/prisma"

// GET /api/task-instances/[id]/labels/[labelId] - Get a single label
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; labelId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: jobId, labelId } = await params
    const organizationId = session.user.organizationId

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId },
    })

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    const label = await TaskInstanceLabelService.getLabelById(labelId, organizationId)

    if (!label || label.taskInstanceId !== jobId) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    // Get contact count
    const stats = await TaskInstanceLabelService.getLabelStats(jobId)
    const stat = stats.find((s) => s.labelId === labelId)

    return NextResponse.json({
      success: true,
      label: {
        ...label,
        metadataSchema: label.metadataSchema as unknown as MetadataFieldSchema[],
        contactCount: stat?.count || 0,
      },
    })
  } catch (error: any) {
    console.error("Get task instance label error:", error)
    return NextResponse.json(
      { error: "Failed to get label", message: error.message },
      { status: 500 }
    )
  }
}

// PATCH /api/task-instances/[id]/labels/[labelId] - Update a label
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; labelId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: jobId, labelId } = await params
    const organizationId = session.user.organizationId

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId },
    })

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    // Verify label belongs to this task instance
    const existingLabel = await TaskInstanceLabelService.getLabelById(labelId, organizationId)
    if (!existingLabel || existingLabel.taskInstanceId !== jobId) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { name, color, metadataSchema } = body as {
      name?: string
      color?: string
      metadataSchema?: MetadataFieldSchema[]
    }

    // Validate metadataSchema if provided
    if (metadataSchema !== undefined) {
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

    const label = await TaskInstanceLabelService.updateLabel(labelId, organizationId, {
      name,
      color,
      metadataSchema,
    })

    if (!label) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    // Get contact count
    const stats = await TaskInstanceLabelService.getLabelStats(jobId)
    const stat = stats.find((s) => s.labelId === labelId)

    return NextResponse.json({
      success: true,
      label: {
        ...label,
        metadataSchema: label.metadataSchema as unknown as MetadataFieldSchema[],
        contactCount: stat?.count || 0,
      },
    })
  } catch (error: any) {
    console.error("Update task instance label error:", error)

    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A label with this name already exists for this item" },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: "Failed to update label", message: error.message },
      { status: 500 }
    )
  }
}

// DELETE /api/task-instances/[id]/labels/[labelId] - Delete a label
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; labelId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id: jobId, labelId } = await params
    const organizationId = session.user.organizationId

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId },
    })

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    // Verify label belongs to this task instance
    const existingLabel = await TaskInstanceLabelService.getLabelById(labelId, organizationId)
    if (!existingLabel || existingLabel.taskInstanceId !== jobId) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    const deleted = await TaskInstanceLabelService.deleteLabel(labelId, organizationId)

    if (!deleted) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Label deleted",
    })
  } catch (error: any) {
    console.error("Delete task instance label error:", error)
    return NextResponse.json(
      { error: "Failed to delete label", message: error.message },
      { status: 500 }
    )
  }
}
