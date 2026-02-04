/**
 * Form Attachment Service
 * 
 * Handles file uploads for form submissions using Vercel Blob storage.
 * Files are tracked in the FormAttachment table for lifecycle management.
 */

import { put, del } from "@vercel/blob"
import { prisma } from "@/lib/prisma"

export interface UploadAttachmentInput {
  file: File | Blob
  filename: string
  mimeType: string
  organizationId: string
  formRequestId: string
  fieldKey: string
}

export interface FormAttachmentResult {
  id: string
  filename: string
  url: string
  mimeType: string
  sizeBytes: number
  fieldKey: string
  uploadedAt: Date
}

export class FormAttachmentService {
  /**
   * Upload a file to Vercel Blob and create a database record
   */
  static async upload(input: UploadAttachmentInput): Promise<FormAttachmentResult> {
    const { file, filename, mimeType, organizationId, formRequestId, fieldKey } = input

    // Verify the form request exists and belongs to the organization
    const formRequest = await prisma.formRequest.findFirst({
      where: {
        id: formRequestId,
        organizationId,
      },
    })

    if (!formRequest) {
      throw new Error("Form request not found")
    }

    // Generate a unique path for the file
    const timestamp = Date.now()
    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_")
    const blobPath = `form-attachments/${organizationId}/${formRequestId}/${fieldKey}/${timestamp}-${safeName}`

    // Upload to Vercel Blob
    const blob = await put(blobPath, file, {
      access: "public",
      contentType: mimeType,
    })

    // Get file size
    const sizeBytes = file instanceof File ? file.size : (file as Blob).size

    // Create database record
    const attachment = await prisma.formAttachment.create({
      data: {
        organizationId,
        formRequestId,
        fieldKey,
        filename,
        url: blob.url,
        mimeType,
        sizeBytes,
      },
    })

    return {
      id: attachment.id,
      filename: attachment.filename,
      url: attachment.url,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      fieldKey: attachment.fieldKey,
      uploadedAt: attachment.uploadedAt,
    }
  }

  /**
   * Delete an attachment from Vercel Blob and the database
   */
  static async delete(attachmentId: string, organizationId: string): Promise<void> {
    // Find the attachment
    const attachment = await prisma.formAttachment.findFirst({
      where: {
        id: attachmentId,
        organizationId,
      },
    })

    if (!attachment) {
      throw new Error("Attachment not found")
    }

    // Delete from Vercel Blob
    try {
      await del(attachment.url)
    } catch (error) {
      // Log but don't fail if blob deletion fails (might already be deleted)
      console.error("Failed to delete blob:", error)
    }

    // Delete database record
    await prisma.formAttachment.delete({
      where: { id: attachmentId },
    })
  }

  /**
   * List all attachments for a form request
   */
  static async listByFormRequest(
    formRequestId: string,
    organizationId: string
  ): Promise<FormAttachmentResult[]> {
    const attachments = await prisma.formAttachment.findMany({
      where: {
        formRequestId,
        organizationId,
      },
      orderBy: { uploadedAt: "asc" },
    })

    return attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: a.url,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      fieldKey: a.fieldKey,
      uploadedAt: a.uploadedAt,
    }))
  }

  /**
   * Get attachments grouped by field key
   */
  static async getByFieldKey(
    formRequestId: string,
    organizationId: string
  ): Promise<Record<string, FormAttachmentResult[]>> {
    const attachments = await this.listByFormRequest(formRequestId, organizationId)
    
    const grouped: Record<string, FormAttachmentResult[]> = {}
    for (const attachment of attachments) {
      if (!grouped[attachment.fieldKey]) {
        grouped[attachment.fieldKey] = []
      }
      grouped[attachment.fieldKey].push(attachment)
    }
    
    return grouped
  }

  /**
   * Delete all attachments for a form request (used when form request is deleted)
   */
  static async deleteAllForFormRequest(
    formRequestId: string,
    organizationId: string
  ): Promise<number> {
    const attachments = await prisma.formAttachment.findMany({
      where: {
        formRequestId,
        organizationId,
      },
    })

    // Delete from Vercel Blob
    for (const attachment of attachments) {
      try {
        await del(attachment.url)
      } catch (error) {
        console.error("Failed to delete blob:", error)
      }
    }

    // Delete all database records
    const result = await prisma.formAttachment.deleteMany({
      where: {
        formRequestId,
        organizationId,
      },
    })

    return result.count
  }
}
