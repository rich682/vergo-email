import { prisma } from "@/lib/prisma"
import { CollectedItem, CollectedItemStatus, CollectedItemSource } from "@prisma/client"
import { getStorageService } from "./storage.service"

export interface CreateFromEmailAttachmentData {
  organizationId: string
  jobId: string
  taskId: string
  messageId: string
  filename: string
  fileKey: string
  fileSize?: number
  mimeType?: string
  submittedBy: string
  submittedByName?: string
  receivedAt: Date
}

export interface CreateFromUploadData {
  organizationId: string
  jobId: string
  taskId?: string
  file: Buffer
  filename: string
  mimeType?: string
  uploadedByUserId: string
  uploadedByEmail: string
}

export interface CollectionFilters {
  status?: CollectedItemStatus
  taskId?: string
  source?: CollectedItemSource
}

export interface ApprovalStatusResult {
  total: number
  approved: number
  rejected: number
  unreviewed: number
  canComplete: boolean
}

export class CollectionService {
  /**
   * Create a collected item from an email attachment
   * Called automatically when attachments are received in reply emails
   */
  static async createFromEmailAttachment(
    data: CreateFromEmailAttachmentData
  ): Promise<CollectedItem> {
    const storage = getStorageService()
    let fileUrl: string | null = null
    
    try {
      fileUrl = await storage.getUrl(data.fileKey)
    } catch {
      // URL generation may fail for some storage backends
    }

    return prisma.collectedItem.create({
      data: {
        organizationId: data.organizationId,
        jobId: data.jobId,
        taskId: data.taskId,
        messageId: data.messageId,
        filename: data.filename,
        fileKey: data.fileKey,
        fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        source: "EMAIL_REPLY",
        submittedBy: data.submittedBy,
        submittedByName: data.submittedByName,
        receivedAt: data.receivedAt,
        status: "UNREVIEWED"
      }
    })
  }

  /**
   * Create a collected item from a manual upload
   */
  static async createFromUpload(
    data: CreateFromUploadData
  ): Promise<CollectedItem> {
    const storage = getStorageService()
    
    // Generate storage key
    const timestamp = Date.now()
    const sanitizedFilename = data.filename.replace(/[^a-zA-Z0-9.-]/g, "_")
    const fileKey = `jobs/${data.jobId}/collection/${timestamp}-${sanitizedFilename}`
    
    // Upload file to storage
    const { url } = await storage.upload(data.file, fileKey, data.mimeType)

    return prisma.collectedItem.create({
      data: {
        organizationId: data.organizationId,
        jobId: data.jobId,
        taskId: data.taskId || null,
        filename: data.filename,
        fileKey,
        fileUrl: url,
        fileSize: data.file.length,
        mimeType: data.mimeType,
        source: "MANUAL_UPLOAD",
        submittedBy: data.uploadedByEmail,
        submittedByName: null, // Manual uploads don't have submitter name
        receivedAt: new Date(),
        status: "UNREVIEWED"
      }
    })
  }

  /**
   * Update the approval status of a collected item
   */
  static async updateStatus(
    id: string,
    organizationId: string,
    status: CollectedItemStatus,
    reviewerId: string,
    rejectionReason?: string
  ): Promise<CollectedItem> {
    // Verify item exists and belongs to organization
    const existing = await prisma.collectedItem.findFirst({
      where: { id, organizationId }
    })

    if (!existing) {
      throw new Error("Collected item not found")
    }

    return prisma.collectedItem.update({
      where: { id },
      data: {
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: status === "REJECTED" ? rejectionReason : null
      }
    })
  }

  /**
   * Bulk update status for multiple items
   */
  static async bulkUpdateStatus(
    ids: string[],
    organizationId: string,
    status: CollectedItemStatus,
    reviewerId: string
  ): Promise<{ updated: number }> {
    const result = await prisma.collectedItem.updateMany({
      where: {
        id: { in: ids },
        organizationId
      },
      data: {
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: null // Clear rejection reason on bulk updates
      }
    })

    return { updated: result.count }
  }

  /**
   * Get all collected items for a job with optional filters
   */
  static async getByJobId(
    jobId: string,
    organizationId: string,
    filters?: CollectionFilters
  ): Promise<CollectedItem[]> {
    const where: any = {
      jobId,
      organizationId
    }

    if (filters?.status) {
      where.status = filters.status
    }

    if (filters?.taskId) {
      where.taskId = filters.taskId
    }

    if (filters?.source) {
      where.source = filters.source
    }

    return prisma.collectedItem.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            campaignName: true,
            entity: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        message: {
          select: {
            id: true,
            subject: true,
            createdAt: true
          }
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { receivedAt: "desc" }
    })
  }

  /**
   * Get a single collected item by ID
   */
  static async getById(
    id: string,
    organizationId: string
  ): Promise<CollectedItem | null> {
    return prisma.collectedItem.findFirst({
      where: { id, organizationId },
      include: {
        task: {
          select: {
            id: true,
            campaignName: true,
            entity: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        message: {
          select: {
            id: true,
            subject: true,
            createdAt: true
          }
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })
  }

  /**
   * Delete a collected item
   */
  static async delete(
    id: string,
    organizationId: string
  ): Promise<void> {
    const item = await prisma.collectedItem.findFirst({
      where: { id, organizationId }
    })

    if (!item) {
      throw new Error("Collected item not found")
    }

    // Delete from storage
    try {
      const storage = getStorageService()
      await storage.delete(item.fileKey)
    } catch (error) {
      console.error("Error deleting file from storage:", error)
      // Continue with database deletion even if storage deletion fails
    }

    await prisma.collectedItem.delete({
      where: { id }
    })
  }

  /**
   * Check the approval status summary for a job
   */
  static async checkJobApprovalStatus(
    jobId: string,
    organizationId: string
  ): Promise<ApprovalStatusResult> {
    const items = await prisma.collectedItem.findMany({
      where: { jobId, organizationId },
      select: { status: true }
    })

    const total = items.length
    const approved = items.filter(i => i.status === "APPROVED").length
    const rejected = items.filter(i => i.status === "REJECTED").length
    const unreviewed = items.filter(i => i.status === "UNREVIEWED").length

    // Job can be completed if there are no unreviewed items
    // (all items must be either approved or rejected)
    const canComplete = total === 0 || unreviewed === 0

    return {
      total,
      approved,
      rejected,
      unreviewed,
      canComplete
    }
  }

  /**
   * Get files for bulk download (returns array of file info)
   * Note: ZIP generation should be done client-side or via a streaming approach
   */
  static async getBulkDownloadFiles(
    ids: string[],
    organizationId: string
  ): Promise<Array<{ id: string; filename: string; fileKey: string }>> {
    const items = await prisma.collectedItem.findMany({
      where: {
        id: { in: ids },
        organizationId
      },
      select: {
        id: true,
        filename: true,
        fileKey: true
      }
    })

    return items
  }

  /**
   * Update notes on a collected item
   */
  static async updateNotes(
    id: string,
    organizationId: string,
    notes: string | null
  ): Promise<CollectedItem> {
    const existing = await prisma.collectedItem.findFirst({
      where: { id, organizationId }
    })

    if (!existing) {
      throw new Error("Collected item not found")
    }

    return prisma.collectedItem.update({
      where: { id },
      data: { notes }
    })
  }

  /**
   * Get download URL for a collected item
   */
  static async getDownloadUrl(
    id: string,
    organizationId: string
  ): Promise<{ url: string; filename: string }> {
    const item = await prisma.collectedItem.findFirst({
      where: { id, organizationId }
    })

    if (!item) {
      throw new Error("Collected item not found")
    }

    const storage = getStorageService()
    const url = await storage.getUrl(item.fileKey)

    return { url, filename: item.filename }
  }

  /**
   * Export metadata for collected items as CSV-ready data
   */
  static async exportMetadata(
    jobId: string,
    organizationId: string
  ): Promise<Array<{
    filename: string
    submittedBy: string | null
    submittedByName: string | null
    receivedAt: Date
    source: string
    status: string
    reviewedBy: string | null
    reviewedAt: Date | null
    taskName: string | null
    notes: string | null
  }>> {
    const items = await prisma.collectedItem.findMany({
      where: { jobId, organizationId },
      include: {
        task: {
          select: { campaignName: true }
        },
        reviewer: {
          select: { name: true, email: true }
        }
      },
      orderBy: { receivedAt: "desc" }
    })

    return items.map(item => ({
      filename: item.filename,
      submittedBy: item.submittedBy,
      submittedByName: item.submittedByName,
      receivedAt: item.receivedAt,
      source: item.source,
      status: item.status,
      reviewedBy: item.reviewer?.name || item.reviewer?.email || null,
      reviewedAt: item.reviewedAt,
      taskName: item.task?.campaignName || null,
      notes: item.notes
    }))
  }
}
