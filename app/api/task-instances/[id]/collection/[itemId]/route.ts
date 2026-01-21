import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EvidenceService } from "@/lib/services/evidence.service"
import { CollectedItemStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/task-instances/[id]/collection/[itemId]
 * Get a single collected item
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const { id: jobId, itemId } = params

    // Verify job exists and belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const item = await EvidenceService.getById(itemId, organizationId)

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // Verify item belongs to the task instance
    if (item.taskInstanceId !== jobId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      item
    })
  } catch (error: any) {
    console.error("Error fetching collection item:", error)
    return NextResponse.json(
      { error: "Failed to fetch item", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/task-instances/[id]/collection/[itemId]
 * Update a collected item (status, notes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const { id: jobId, itemId } = params

    // Verify job exists and belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Verify item exists and belongs to task instance
    const existingItem = await EvidenceService.getById(itemId, organizationId)
    if (!existingItem || existingItem.taskInstanceId !== jobId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    const body = await request.json()
    const { status, rejectionReason, notes } = body

    let updatedItem = existingItem

    // Update status if provided
    if (status && ["UNREVIEWED", "APPROVED", "REJECTED"].includes(status)) {
      updatedItem = await EvidenceService.updateStatus(
        itemId,
        organizationId,
        status as CollectedItemStatus,
        userId,
        rejectionReason
      )
    }

    // Update notes if provided
    if (notes !== undefined) {
      updatedItem = await EvidenceService.updateNotes(
        itemId,
        organizationId,
        notes
      )
    }

    // Get updated approval status for the task instance
    const approvalStatus = await EvidenceService.checkTaskInstanceApprovalStatus(jobId, organizationId)

    return NextResponse.json({
      success: true,
      item: updatedItem,
      summary: approvalStatus
    })
  } catch (error: any) {
    console.error("Error updating collection item:", error)
    return NextResponse.json(
      { error: "Failed to update item", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/task-instances/[id]/collection/[itemId]
 * Delete a collected item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const { id: jobId, itemId } = params

    // Verify job exists and belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Verify item exists and belongs to task instance
    const existingItem = await EvidenceService.getById(itemId, organizationId)
    if (!existingItem || existingItem.taskInstanceId !== jobId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    await EvidenceService.delete(itemId, organizationId)

    // Get updated approval status for the task instance
    const approvalStatus = await EvidenceService.checkTaskInstanceApprovalStatus(jobId, organizationId)

    return NextResponse.json({
      success: true,
      summary: approvalStatus
    })
  } catch (error: any) {
    console.error("Error deleting collection item:", error)
    return NextResponse.json(
      { error: "Failed to delete item", message: error.message },
      { status: 500 }
    )
  }
}
