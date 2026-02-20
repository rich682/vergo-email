import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EvidenceService } from "@/lib/services/evidence.service"
import { CollectedItemStatus } from "@prisma/client"
import { canPerformAction } from "@/lib/permissions"
import { ActivityEventService } from "@/lib/activity-events"

export const maxDuration = 120;
export const dynamic = "force-dynamic"

/**
 * POST /api/task-instances/[id]/collection/bulk
 * Perform bulk operations on collected items
 * 
 * Actions:
 * - approve: Bulk approve items
 * - reject: Bulk reject items
 * - download: Generate ZIP of items
 * - delete: Bulk delete items
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
    const userId = session.user.id
    const jobId = params.id

    if (!canPerformAction(session.user.role, "collection:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage collected items" }, { status: 403 })
    }

    // Verify job exists and belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const body = await request.json()
    const { action, ids } = body

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: action and ids array required" },
        { status: 400 }
      )
    }

    // Verify all items belong to this task instance
    const items = await prisma.collectedItem.findMany({
      where: {
        id: { in: ids },
        organizationId,
        taskInstanceId: jobId
      },
      select: { id: true }
    })

    const validIds = items.map(i => i.id)
    if (validIds.length !== ids.length) {
      return NextResponse.json(
        { error: "Some items not found or don't belong to this task" },
        { status: 400 }
      )
    }

    switch (action) {
      case "approve": {
        const result = await EvidenceService.bulkUpdateStatus(
          validIds,
          organizationId,
          "APPROVED" as CollectedItemStatus,
          userId
        )
        ActivityEventService.logEvidenceAction({
          organizationId, taskInstanceId: jobId, actorId: userId,
          actorName: session.user.name || "Someone", itemIds: validIds, action: "approve",
        })
        const approvalStatus = await EvidenceService.checkTaskInstanceApprovalStatus(jobId, organizationId)
        return NextResponse.json({
          success: true,
          updated: result.updated,
          summary: approvalStatus
        })
      }

      case "reject": {
        const result = await EvidenceService.bulkUpdateStatus(
          validIds,
          organizationId,
          "REJECTED" as CollectedItemStatus,
          userId
        )
        ActivityEventService.logEvidenceAction({
          organizationId, taskInstanceId: jobId, actorId: userId,
          actorName: session.user.name || "Someone", itemIds: validIds, action: "reject",
        })
        const approvalStatus = await EvidenceService.checkTaskInstanceApprovalStatus(jobId, organizationId)
        return NextResponse.json({
          success: true,
          updated: result.updated,
          summary: approvalStatus
        })
      }

      case "reset": {
        const result = await EvidenceService.bulkUpdateStatus(
          validIds,
          organizationId,
          "UNREVIEWED" as CollectedItemStatus,
          userId
        )
        ActivityEventService.logEvidenceAction({
          organizationId, taskInstanceId: jobId, actorId: userId,
          actorName: session.user.name || "Someone", itemIds: validIds, action: "reset",
        })
        const approvalStatus = await EvidenceService.checkTaskInstanceApprovalStatus(jobId, organizationId)
        return NextResponse.json({
          success: true,
          updated: result.updated,
          summary: approvalStatus
        })
      }

      case "download": {
        // Return list of files for client-side download
        const files = await EvidenceService.getBulkDownloadFiles(validIds, organizationId)
        return NextResponse.json({
          success: true,
          files,
          message: "Download each file individually using the download endpoint"
        })
      }

      case "delete": {
        let deleted = 0
        for (const id of validIds) {
          try {
            await EvidenceService.delete(id, organizationId)
            deleted++
          } catch (error) {
            console.error(`Error deleting item ${id}:`, error)
          }
        }
        if (deleted > 0) {
          ActivityEventService.logEvidenceAction({
            organizationId, taskInstanceId: jobId, actorId: userId,
            actorName: session.user.name || "Someone", itemIds: validIds.slice(0, deleted), action: "delete",
          })
        }
        const approvalStatus = await EvidenceService.checkTaskInstanceApprovalStatus(jobId, organizationId)
        return NextResponse.json({
          success: true,
          deleted,
          summary: approvalStatus
        })
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Valid actions: approve, reject, reset, download, delete" },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error("Error performing bulk operation:", error)
    return NextResponse.json(
      { error: "Failed to perform bulk operation" },
      { status: 500 }
    )
  }
}
