import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EvidenceService } from "@/lib/services/evidence.service"
import { CollectedItemStatus, CollectedItemSource } from "@prisma/client"
import { canPerformAction } from "@/lib/permissions"

export const dynamic = "force-dynamic"

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

// Allowed MIME types for collection uploads (security: prevent executable uploads)
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
  // Archives
  "application/zip",
  "application/x-zip-compressed",
])

// Blocked file extensions
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
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."))
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: `File type "${ext}" is not allowed for security reasons` }
  }
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    const safeExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".rtf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".zip"])
    if (!safeExtensions.has(ext)) {
      return { allowed: false, reason: `File type "${mimeType}" is not allowed` }
    }
  }
  return { allowed: true }
}

/**
 * GET /api/task-instances/[id]/collection
 * List all collected items for a job
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
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Parse query params for filters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") as CollectedItemStatus | null
    const requestId = searchParams.get("requestId")
    const source = searchParams.get("source") as CollectedItemSource | null

    const filters: {
      status?: CollectedItemStatus
      requestId?: string
      source?: CollectedItemSource
    } = {}

    if (status && ["UNREVIEWED", "APPROVED", "REJECTED"].includes(status)) {
      filters.status = status
    }
    if (requestId) {
      filters.requestId = requestId
    }
    if (source && ["EMAIL_REPLY", "MANUAL_UPLOAD"].includes(source)) {
      filters.source = source
    }

    const items = await EvidenceService.getByTaskInstanceId(jobId, organizationId, filters)
    const approvalStatus = await EvidenceService.checkTaskInstanceApprovalStatus(jobId, organizationId)

    return NextResponse.json({
      success: true,
      items,
      summary: approvalStatus
    })
  } catch (error: any) {
    console.error("Error fetching collection items:", error)
    return NextResponse.json(
      { error: "Failed to fetch collection items" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/task-instances/[id]/collection
 * Upload a new file to the collection (manual upload)
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
    const userEmail = session.user.email || ""
    const jobId = params.id

    if (!canPerformAction(session.user.role, "collection:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to upload collection files" }, { status: 403 })
    }

    // Verify job exists and belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const requestId = formData.get("requestId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    // Validate file type (security)
    const fileValidation = isAllowedFile(file.name, file.type || undefined)
    if (!fileValidation.allowed) {
      return NextResponse.json(
        { error: fileValidation.reason || "File type not allowed" },
        { status: 400 }
      )
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Create collected item
    const item = await EvidenceService.createFromUpload({
      organizationId,
      taskInstanceId: jobId,
      requestId: requestId || undefined,
      file: buffer,
      filename: file.name,
      mimeType: file.type || undefined,
      uploadedByUserId: userId,
      uploadedByEmail: userEmail
    })

    return NextResponse.json({
      success: true,
      item
    })
  } catch (error: any) {
    console.error("Error uploading collection item:", error)
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    )
  }
}
