import { prisma } from "@/lib/prisma"
import { CollectedItem, CollectedItemStatus, CollectedItemSource } from "@prisma/client"
import { getStorageService } from "./storage.service"

export interface CreateFromEmailAttachmentData {
  organizationId: string
  taskInstanceId: string
  requestId: string
  messageId: string
  filename: string
  fileKey: string
  fileUrl?: string
  fileSize?: number
  mimeType?: string
  submittedBy: string
  submittedByName?: string
  receivedAt: Date
}

export interface CreateFromUploadData {
  organizationId: string
  taskInstanceId: string
  requestId?: string
  file: Buffer
  filename: string
  mimeType?: string
  uploadedByUserId: string
  uploadedByEmail: string
}

export interface EvidenceFilters {
  status?: CollectedItemStatus
  requestId?: string
  source?: CollectedItemSource
}

export interface ApprovalStatusResult {
  total: number
  approved: number
  rejected: number
  unreviewed: number
  canComplete: boolean
}

export class EvidenceService {
  static async createFromEmailAttachment(
    data: CreateFromEmailAttachmentData
  ): Promise<CollectedItem> {
    let fileUrl: string | null = data.fileUrl || null
    if (!fileUrl) {
      try {
        const storage = getStorageService()
        fileUrl = await storage.getUrl(data.fileKey)
      } catch {
        console.warn(`[EvidenceService] Could not get URL for fileKey: ${data.fileKey}`)
      }
    }

    return prisma.collectedItem.create({
      data: {
        organizationId: data.organizationId,
        taskInstanceId: data.taskInstanceId,
        requestId: data.requestId,
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

  static async createFromUpload(
    data: CreateFromUploadData
  ): Promise<CollectedItem> {
    const storage = getStorageService()
    const timestamp = Date.now()
    const sanitizedFilename = data.filename.replace(/[^a-zA-Z0-9.-]/g, "_")
    const fileKey = `tasks/${data.taskInstanceId}/evidence/${timestamp}-${sanitizedFilename}`
    const { url } = await storage.upload(data.file, fileKey, data.mimeType)

    return prisma.collectedItem.create({
      data: {
        organizationId: data.organizationId,
        taskInstanceId: data.taskInstanceId,
        requestId: data.requestId || null,
        filename: data.filename,
        fileKey,
        fileUrl: url,
        fileSize: data.file.length,
        mimeType: data.mimeType,
        source: "MANUAL_UPLOAD",
        submittedBy: data.uploadedByEmail,
        submittedByName: null,
        receivedAt: new Date(),
        status: "UNREVIEWED"
      }
    })
  }

  static async updateStatus(
    id: string,
    organizationId: string,
    status: CollectedItemStatus,
    reviewerId: string,
    rejectionReason?: string
  ): Promise<CollectedItem> {
    const existing = await prisma.collectedItem.findFirst({
      where: { id, organizationId }
    })

    if (!existing) throw new Error("Evidence item not found")

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

  static async getByTaskInstanceId(
    taskInstanceId: string,
    organizationId: string,
    filters?: EvidenceFilters
  ): Promise<CollectedItem[]> {
    const where: any = { taskInstanceId, organizationId }
    if (filters?.status) where.status = filters.status
    if (filters?.requestId) where.requestId = filters.requestId
    if (filters?.source) where.source = filters.source

    return prisma.collectedItem.findMany({
      where,
      include: {
        request: {
          select: {
            id: true,
            campaignName: true,
            entity: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        },
        message: { select: { id: true, subject: true, createdAt: true } },
        reviewer: { select: { id: true, name: true, email: true } }
      },
      orderBy: { receivedAt: "desc" }
    })
  }

  static async delete(id: string, organizationId: string): Promise<void> {
    const item = await prisma.collectedItem.findFirst({
      where: { id, organizationId }
    })

    if (!item) throw new Error("Evidence item not found")

    try {
      const storage = getStorageService()
      await storage.delete(item.fileKey)
    } catch (error) {
      console.error("Error deleting file from storage:", error)
    }

    await prisma.collectedItem.delete({ where: { id } })
  }

  /**
   * Check the approval status summary for a task instance
   */
  static async checkTaskInstanceApprovalStatus(
    taskInstanceId: string,
    organizationId: string
  ): Promise<ApprovalStatusResult> {
    const items = await prisma.collectedItem.findMany({
      where: { taskInstanceId, organizationId },
      select: { status: true }
    })

    const total = items.length
    const approved = items.filter(i => i.status === "APPROVED").length
    const rejected = items.filter(i => i.status === "REJECTED").length
    const unreviewed = items.filter(i => i.status === "UNREVIEWED").length
    const canComplete = total === 0 || unreviewed === 0

    return { total, approved, rejected, unreviewed, canComplete }
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
        rejectionReason: null
      }
    })

    return { updated: result.count }
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
        request: {
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
   * Get files for bulk download
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
      throw new Error("Evidence item not found")
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
      throw new Error("Evidence item not found")
    }

    const storage = getStorageService()
    const url = await storage.getUrl(item.fileKey)

    return { url, filename: item.filename }
  }

  /**
   * Export metadata for collected items as CSV-ready data
   */
  static async exportMetadata(
    taskInstanceId: string,
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
    requestName: string | null
    notes: string | null
  }>> {
    const items = await prisma.collectedItem.findMany({
      where: { taskInstanceId, organizationId },
      include: {
        request: {
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
      requestName: item.request?.campaignName || null,
      notes: item.notes
    }))
  }
}
