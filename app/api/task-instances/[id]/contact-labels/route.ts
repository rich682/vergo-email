import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TaskInstanceLabelService } from "@/lib/services/task-instance-label.service"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

// GET /api/task-instances/[id]/contact-labels - List contacts with their labels
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

    const contacts = await TaskInstanceLabelService.getContactsWithLabels(taskInstanceId, organizationId)

    return NextResponse.json({
      success: true,
      contacts,
    })
  } catch (error: any) {
    console.error("List contact labels error:", error)
    return NextResponse.json(
      { error: "Failed to list contact labels" },
      { status: 500 }
    )
  }
}

// POST /api/task-instances/[id]/contact-labels - Apply label to contacts
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

    if (!canPerformAction(session.user.role, "labels:apply_contacts", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to apply labels to contacts" }, { status: 403 })
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
    const { taskInstanceLabelId, entityIds, metadata } = body as {
      taskInstanceLabelId: string
      entityIds: string[]
      metadata?: Record<string, string | number | null>
    }

    if (!taskInstanceLabelId || typeof taskInstanceLabelId !== "string") {
      return NextResponse.json(
        { error: "taskInstanceLabelId is required" },
        { status: 400 }
      )
    }

    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      return NextResponse.json(
        { error: "entityIds must be a non-empty array" },
        { status: 400 }
      )
    }

    // Verify label belongs to this task instance
    const label = await TaskInstanceLabelService.getLabelById(taskInstanceLabelId, organizationId)
    if (!label || label.taskInstanceId !== taskInstanceId) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    // Verify all entities belong to the organization
    const entities = await prisma.entity.findMany({
      where: {
        id: { in: entityIds },
        organizationId,
      },
      select: { id: true },
    })

    const validEntityIds = entities.map((e) => e.id)
    const invalidIds = entityIds.filter((id) => !validEntityIds.includes(id))

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Invalid entity IDs: ${invalidIds.join(", ")}` },
        { status: 400 }
      )
    }

    const contactLabels = await TaskInstanceLabelService.applyLabelToContacts({
      taskInstanceLabelId,
      entityIds: validEntityIds,
      metadata,
    })

    return NextResponse.json({
      success: true,
      applied: contactLabels.length,
      contactLabels,
    })
  } catch (error: any) {
    console.error("Apply contact label error:", error)
    return NextResponse.json(
      { error: "Failed to apply label" },
      { status: 500 }
    )
  }
}

// DELETE /api/task-instances/[id]/contact-labels - Remove label from contact
export async function DELETE(
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

    if (!canPerformAction(session.user.role, "labels:apply_contacts", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to remove labels from contacts" }, { status: 403 })
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
    const { taskInstanceLabelId, entityId } = body as {
      taskInstanceLabelId: string
      entityId: string
    }

    if (!taskInstanceLabelId || typeof taskInstanceLabelId !== "string") {
      return NextResponse.json(
        { error: "taskInstanceLabelId is required" },
        { status: 400 }
      )
    }

    if (!entityId || typeof entityId !== "string") {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 }
      )
    }

    // Verify label belongs to this task instance
    const label = await TaskInstanceLabelService.getLabelById(taskInstanceLabelId, organizationId)
    if (!label || label.taskInstanceId !== taskInstanceId) {
      return NextResponse.json(
        { error: "Label not found" },
        { status: 404 }
      )
    }

    const removed = await TaskInstanceLabelService.removeLabelFromContact(taskInstanceLabelId, entityId)

    if (!removed) {
      return NextResponse.json(
        { error: "Contact label not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Label removed from contact",
    })
  } catch (error: any) {
    console.error("Remove contact label error:", error)
    return NextResponse.json(
      { error: "Failed to remove label" },
      { status: 500 }
    )
  }
}

// PATCH /api/task-instances/[id]/contact-labels - Update metadata for a contact label
export async function PATCH(
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

    if (!canPerformAction(session.user.role, "labels:apply_contacts", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to update contact labels" }, { status: 403 })
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
    const { contactLabelId, metadata } = body as {
      contactLabelId: string
      metadata: Record<string, string | number | null>
    }

    if (!contactLabelId || typeof contactLabelId !== "string") {
      return NextResponse.json(
        { error: "contactLabelId is required" },
        { status: 400 }
      )
    }

    if (!metadata || typeof metadata !== "object") {
      return NextResponse.json(
        { error: "metadata is required and must be an object" },
        { status: 400 }
      )
    }

    // Verify the contact label exists and belongs to this task instance
    const contactLabel = await prisma.taskInstanceContactLabel.findUnique({
      where: { id: contactLabelId },
      include: {
        taskInstanceLabel: {
          select: { taskInstanceId: true, organizationId: true },
        },
      },
    })

    if (!contactLabel || contactLabel.taskInstanceLabel.taskInstanceId !== taskInstanceId || contactLabel.taskInstanceLabel.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Contact label not found" },
        { status: 404 }
      )
    }

    const updated = await TaskInstanceLabelService.updateContactLabelMetadata(contactLabelId, metadata)

    return NextResponse.json({
      success: true,
      contactLabel: updated,
    })
  } catch (error: any) {
    console.error("Update contact label metadata error:", error)
    return NextResponse.json(
      { error: "Failed to update metadata" },
      { status: 500 }
    )
  }
}
