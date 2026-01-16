import { prisma } from "@/lib/prisma"
import { Attachment } from "@prisma/client"
import { getStorageService } from "./storage.service"

export interface CreateAttachmentData {
  organizationId: string
  jobId?: string
  subtaskId?: string
  file: Buffer
  filename: string
  mimeType?: string
  uploadedById: string
}

export interface AttachmentWithUploader extends Attachment {
  uploadedBy: {
    id: string
    name: string | null
    email: string
  }
}

export class AttachmentService {
  /**
   * Create a new attachment (upload file)
   */
  static async create(data: CreateAttachmentData): Promise<AttachmentWithUploader> {
    // Validate that exactly one of jobId or subtaskId is provided
    if (!data.jobId && !data.subtaskId) {
      throw new Error("Either jobId or subtaskId must be provided")
    }
    if (data.jobId && data.subtaskId) {
      throw new Error("Only one of jobId or subtaskId should be provided")
    }

    const storage = getStorageService()

    // Generate storage key based on parent type
    const timestamp = Date.now()
    const sanitizedFilename = data.filename.replace(/[^a-zA-Z0-9.-]/g, "_")
    const parentType = data.jobId ? "jobs" : "subtasks"
    const parentId = data.jobId || data.subtaskId
    const fileKey = `${parentType}/${parentId}/attachments/${timestamp}-${sanitizedFilename}`

    // Upload file to storage
    const { url } = await storage.upload(data.file, fileKey, data.mimeType)

    // Create attachment record
    const attachment = await prisma.attachment.create({
      data: {
        organizationId: data.organizationId,
        jobId: data.jobId || null,
        subtaskId: data.subtaskId || null,
        filename: data.filename,
        fileKey,
        fileUrl: url,
        fileSize: data.file.length,
        mimeType: data.mimeType,
        uploadedById: data.uploadedById
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return attachment
  }

  /**
   * Create attachment from inbound email (no uploadedById required)
   * Used when processing email replies with attachments
   */
  static async createFromInboundEmail(data: {
    organizationId: string
    jobId: string
    file: Buffer
    filename: string
    mimeType?: string
    fileKey: string // Pre-generated storage key
  }): Promise<Attachment> {
    // Get a system user or the job owner to attribute the upload
    const job = await prisma.job.findUnique({
      where: { id: data.jobId },
      select: { ownerId: true }
    })

    if (!job) {
      throw new Error("Job not found")
    }

    // Create attachment record (file already uploaded to storage)
    const attachment = await prisma.attachment.create({
      data: {
        organizationId: data.organizationId,
        jobId: data.jobId,
        filename: data.filename,
        fileKey: data.fileKey,
        fileSize: data.file.length,
        mimeType: data.mimeType,
        uploadedById: job.ownerId // Attribute to job owner
      }
    })

    return attachment
  }

  /**
   * Get all attachments for a job
   */
  static async getByJobId(
    jobId: string,
    organizationId: string
  ): Promise<AttachmentWithUploader[]> {
    return prisma.attachment.findMany({
      where: { jobId, organizationId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })
  }

  /**
   * Get all attachments for a subtask
   */
  static async getBySubtaskId(
    subtaskId: string,
    organizationId: string
  ): Promise<AttachmentWithUploader[]> {
    return prisma.attachment.findMany({
      where: { subtaskId, organizationId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })
  }

  /**
   * Get a single attachment by ID
   */
  static async getById(
    id: string,
    organizationId: string
  ): Promise<AttachmentWithUploader | null> {
    return prisma.attachment.findFirst({
      where: { id, organizationId },
      include: {
        uploadedBy: {
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
   * Get download URL for an attachment
   */
  static async getDownloadUrl(
    id: string,
    organizationId: string
  ): Promise<{ url: string; filename: string }> {
    const attachment = await prisma.attachment.findFirst({
      where: { id, organizationId }
    })

    if (!attachment) {
      throw new Error("Attachment not found")
    }

    const storage = getStorageService()
    const url = await storage.getUrl(attachment.fileKey)

    return { url, filename: attachment.filename }
  }

  /**
   * Delete an attachment
   */
  static async delete(id: string, organizationId: string): Promise<void> {
    const attachment = await prisma.attachment.findFirst({
      where: { id, organizationId }
    })

    if (!attachment) {
      throw new Error("Attachment not found")
    }

    // Delete from storage
    try {
      const storage = getStorageService()
      await storage.delete(attachment.fileKey)
    } catch (error) {
      console.error("Error deleting file from storage:", error)
      // Continue with database deletion even if storage deletion fails
    }

    // Delete from database
    await prisma.attachment.delete({
      where: { id }
    })
  }

  /**
   * Get attachment count for a job
   */
  static async getJobAttachmentCount(
    jobId: string,
    organizationId: string
  ): Promise<number> {
    return prisma.attachment.count({
      where: { jobId, organizationId }
    })
  }

  /**
   * Get attachment count for a subtask
   */
  static async getSubtaskAttachmentCount(
    subtaskId: string,
    organizationId: string
  ): Promise<number> {
    return prisma.attachment.count({
      where: { subtaskId, organizationId }
    })
  }

  /**
   * Get total attachment count for a job (including subtask attachments)
   */
  static async getTotalJobAttachmentCount(
    jobId: string,
    organizationId: string
  ): Promise<{ jobAttachments: number; subtaskAttachments: number; total: number }> {
    const [jobCount, subtaskCount] = await Promise.all([
      prisma.attachment.count({
        where: { jobId, organizationId }
      }),
      prisma.attachment.count({
        where: {
          organizationId,
          subtask: { jobId }
        }
      })
    ])

    return {
      jobAttachments: jobCount,
      subtaskAttachments: subtaskCount,
      total: jobCount + subtaskCount
    }
  }
}
