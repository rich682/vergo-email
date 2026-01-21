import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CollectionService } from "@/lib/services/collection.service"
import { CollectedItemStatus } from "@prisma/client"

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

    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
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

    // Verify all items belong to this job
    const items = await prisma.collectedItem.findMany({
      where: {
        id: { in: ids },
        organizationId,
        jobId
      },
      select: { id: true }
    })

    const validIds = items.map(i => i.id)
    if (validIds.length !== ids.length) {
      return NextResponse.json(
        { error: "Some items not found or don't belong to this job" },
        { status: 400 }
      )
    }

    switch (action) {
      case "approve": {
        const result = await CollectionService.bulkUpdateStatus(
          validIds,
          organizationId,
          "APPROVED" as CollectedItemStatus,
          userId
        )
        const approvalStatus = await CollectionService.checkJobApprovalStatus(jobId, organizationId)
        return NextResponse.json({
          success: true,
          updated: result.updated,
          summary: approvalStatus
        })
      }

      case "reject": {
        const result = await CollectionService.bulkUpdateStatus(
          validIds,
          organizationId,
          "REJECTED" as CollectedItemStatus,
          userId
        )
        const approvalStatus = await CollectionService.checkJobApprovalStatus(jobId, organizationId)
        return NextResponse.json({
          success: true,
          updated: result.updated,
          summary: approvalStatus
        })
      }

      case "reset": {
        const result = await CollectionService.bulkUpdateStatus(
          validIds,
          organizationId,
          "UNREVIEWED" as CollectedItemStatus,
          userId
        )
        const approvalStatus = await CollectionService.checkJobApprovalStatus(jobId, organizationId)
        return NextResponse.json({
          success: true,
          updated: result.updated,
          summary: approvalStatus
        })
      }

      case "download": {
        // Return list of files for client-side download
        const files = await CollectionService.getBulkDownloadFiles(validIds, organizationId)
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
            await CollectionService.delete(id, organizationId)
            deleted++
          } catch (error) {
            console.error(`Error deleting item ${id}:`, error)
          }
        }
        const approvalStatus = await CollectionService.checkJobApprovalStatus(jobId, organizationId)
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
      { error: "Failed to perform bulk operation", message: error.message },
      { status: 500 }
    )
  }
}
