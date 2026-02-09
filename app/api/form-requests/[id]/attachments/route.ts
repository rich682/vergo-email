/**
 * Form Request Attachments API
 * 
 * POST - Upload a file attachment to a form request
 * GET - List all attachments for a form request
 * DELETE - Remove an attachment by ID
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { FormAttachmentService } from "@/lib/services/form-attachment.service"

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]

/**
 * POST - Upload a file attachment
 * Body: multipart/form-data with 'file' and 'fieldKey'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formRequestId } = await params

    // Get form request to verify it exists and get organization ID
    const formRequest = await prisma.formRequest.findUnique({
      where: { id: formRequestId },
      select: { 
        id: true, 
        organizationId: true, 
        status: true 
      },
    })

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }

    // Check if form is already submitted
    if (formRequest.status === "SUBMITTED") {
      return NextResponse.json({ error: "Cannot upload to a submitted form" }, { status: 400 })
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const fieldKey = formData.get("fieldKey") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!fieldKey) {
      return NextResponse.json({ error: "Field key is required" }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      }, { status: 400 })
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ 
        error: "File type not allowed. Please upload PDF, Office documents, or images." 
      }, { status: 400 })
    }

    // Upload the file
    const attachment = await FormAttachmentService.upload({
      file,
      filename: file.name,
      mimeType: file.type,
      organizationId: formRequest.organizationId,
      formRequestId,
      fieldKey,
    })

    return NextResponse.json({ attachment }, { status: 201 })
  } catch (error: any) {
    console.error("Error uploading attachment:", error)
    return NextResponse.json(
      { error: "Failed to upload attachment" },
      { status: 500 }
    )
  }
}

/**
 * GET - List all attachments for a form request
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formRequestId } = await params

    // Get form request to verify it exists and get organization ID
    const formRequest = await prisma.formRequest.findUnique({
      where: { id: formRequestId },
      select: { id: true, organizationId: true },
    })

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }

    const attachments = await FormAttachmentService.listByFormRequest(
      formRequestId,
      formRequest.organizationId
    )

    return NextResponse.json({ attachments })
  } catch (error: any) {
    console.error("Error listing attachments:", error)
    return NextResponse.json(
      { error: "Failed to list attachments" },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Remove an attachment
 * Query param: attachmentId
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: formRequestId } = await params
    const { searchParams } = new URL(request.url)
    const attachmentId = searchParams.get("attachmentId")

    if (!attachmentId) {
      return NextResponse.json({ error: "Attachment ID is required" }, { status: 400 })
    }

    // Get form request to verify it exists and get organization ID
    const formRequest = await prisma.formRequest.findUnique({
      where: { id: formRequestId },
      select: { 
        id: true, 
        organizationId: true,
        status: true 
      },
    })

    if (!formRequest) {
      return NextResponse.json({ error: "Form request not found" }, { status: 404 })
    }

    // Check if form is already submitted
    if (formRequest.status === "SUBMITTED") {
      return NextResponse.json({ error: "Cannot delete from a submitted form" }, { status: 400 })
    }

    // Delete the attachment
    await FormAttachmentService.delete(attachmentId, formRequest.organizationId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting attachment:", error)
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    )
  }
}
