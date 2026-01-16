import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { AttachmentService } from "@/lib/services/attachment.service"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

// Allowed MIME types for attachments (security: prevent executable uploads)
const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/rtf",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  // Archives (common for document bundles)
  "application/zip",
  "application/x-zip-compressed",
])

// Blocked file extensions (additional safety layer)
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr",
  ".js", ".vbs", ".vbe", ".jse", ".ws", ".wsf", ".wsc", ".wsh",
  ".ps1", ".psm1", ".psd1",
  ".sh", ".bash",
  ".dll", ".sys",
  ".app", ".dmg", ".pkg",
  ".jar", ".class",
  ".py", ".pyc", ".pyo",
  ".rb", ".php", ".pl", ".cgi",
])

function isAllowedFile(filename: string, mimeType: string | undefined): { allowed: boolean; reason?: string } {
  // Check extension
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."))
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: `File type "${ext}" is not allowed for security reasons` }
  }

  // Check MIME type (if provided)
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    // Allow if MIME type is not in blocklist but extension is safe
    // This handles cases where browser reports unknown MIME types
    const safeExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".rtf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".zip"])
    if (!safeExtensions.has(ext)) {
      return { allowed: false, reason: `File type "${mimeType}" is not allowed` }
    }
  }

  return { allowed: true }
}

/**
 * GET /api/jobs/[id]/attachments - List all attachments for a job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id

    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const attachments = await AttachmentService.getByJobId(jobId, organizationId)

    return NextResponse.json({ attachments })
  } catch (error: any) {
    console.error("[API/jobs/[id]/attachments] Error listing attachments:", error)
    return NextResponse.json(
      { error: "Failed to list attachments", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/jobs/[id]/attachments - Upload an attachment to a job
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

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    // Check file type (security)
    const fileCheck = isAllowedFile(file.name, file.type)
    if (!fileCheck.allowed) {
      return NextResponse.json(
        { error: fileCheck.reason || "File type not allowed" },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const attachment = await AttachmentService.create({
      organizationId,
      jobId,
      file: buffer,
      filename: file.name,
      mimeType: file.type || undefined,
      uploadedById: userId
    })

    return NextResponse.json({ attachment }, { status: 201 })
  } catch (error: any) {
    console.error("[API/jobs/[id]/attachments] Error uploading attachment:", error)
    return NextResponse.json(
      { error: "Failed to upload attachment", message: error.message },
      { status: 500 }
    )
  }
}
