import { prisma } from "@/lib/prisma"
import { Attachment } from "@prisma/client"
import { getStorageService } from "./storage.service"

export interface CreateAttachmentData {
  organizationId: string
  taskInstanceId?: string
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
    if (!data.taskInstanceId && !data.subtaskId) {
      throw new Error("Either taskInstanceId or subtaskId must be provided")
    }
    if (data.taskInstanceId && data.subtaskId) {
      throw new Error("Only one of taskInstanceId or subtaskId should be provided")
    }

    const storage = getStorageService()

    const timestamp = Date.now()
    const sanitizedFilename = data.filename.replace(/[^a-zA-Z0-9.-]/g, "_")
    const parentType = data.taskInstanceId ? "tasks" : "subtasks"
    const parentId = data.taskInstanceId || data.subtaskId
    const fileKey = `${parentType}/${parentId}/attachments/${timestamp}-${sanitizedFilename}`

    const { url } = await storage.upload(data.file, fileKey, data.mimeType)

    const attachment = await prisma.attachment.create({
      data: {
        organizationId: data.organizationId,
        taskInstanceId: data.taskInstanceId || null,
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
   * Create attachment from inbound email
   */
  static async createFromInboundEmail(data: {
    organizationId: string
    taskInstanceId: string
    file: Buffer
    filename: string
    mimeType?: string
    fileKey: string
  }): Promise<Attachment> {
    const instance = await prisma.taskInstance.findUnique({
      where: { id: data.taskInstanceId },
      select: { ownerId: true }
    })

    if (!instance) {
      throw new Error("Task instance not found")
    }

    const attachment = await prisma.attachment.create({
      data: {
        organizationId: data.organizationId,
        taskInstanceId: data.taskInstanceId,
        filename: data.filename,
        fileKey: data.fileKey,
        fileSize: data.file.length,
        mimeType: data.mimeType,
        uploadedById: instance.ownerId
      }
    })

    return attachment
  }

  /**
   * Get all attachments for a task instance
   */
  static async getByTaskInstanceId(
    taskInstanceId: string,
    organizationId: string
  ): Promise<AttachmentWithUploader[]> {
    return prisma.attachment.findMany({
      where: { taskInstanceId, organizationId },
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

    try {
      const storage = getStorageService()
      await storage.delete(attachment.fileKey)
    } catch (error) {
      console.error("Error deleting file from storage:", error)
    }

    await prisma.attachment.delete({
      where: { id }
    })
  }

  /**
   * Get attachment count for a task instance
   */
  static async getTaskInstanceAttachmentCount(
    taskInstanceId: string,
    organizationId: string
  ): Promise<number> {
    return prisma.attachment.count({
      where: { taskInstanceId, organizationId }
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
   * Get total attachment count for a task instance (including subtask attachments)
   */
  static async getTotalTaskInstanceAttachmentCount(
    taskInstanceId: string,
    organizationId: string
  ): Promise<{ taskInstanceAttachments: number; subtaskAttachments: number; total: number }> {
    const [taskCount, subtaskCount] = await Promise.all([
      prisma.attachment.count({
        where: { taskInstanceId, organizationId }
      }),
      prisma.attachment.count({
        where: {
          organizationId,
          subtask: { taskInstanceId }
        }
      })
    ])

    return {
      taskInstanceAttachments: taskCount,
      subtaskAttachments: subtaskCount,
      total: taskCount + subtaskCount
    }
  }
}
