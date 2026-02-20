import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { AttachmentService } from "@/lib/services/attachment.service"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { ActivityEventService } from "@/lib/activity-events"

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
 * GET /api/task-instances/[id]/attachments - List all attachments for a task instance
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
    const taskInstanceId = params.id

    // Verify task instance exists and belongs to organization
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    const attachments = await AttachmentService.getByTaskInstanceId(taskInstanceId, organizationId)

    return NextResponse.json({ attachments })
  } catch (error: any) {
    console.error("[API/task-instances/[id]/attachments] Error listing attachments:", error)
    return NextResponse.json(
      { error: "Failed to list attachments" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/task-instances/[id]/attachments - Upload an attachment to a task instance
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

    if (!canPerformAction(session.user.role, "attachments:upload", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to upload attachments" }, { status: 403 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const taskInstanceId = params.id

    // Verify task instance exists and belongs to organization
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
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
      taskInstanceId,
      file: buffer,
      filename: file.name,
      mimeType: file.type || undefined,
      uploadedById: userId
    })

    // Auto-transition task instance to IN_PROGRESS when attachment is uploaded
    try {
      await TaskInstanceService.markInProgressIfNotStarted(taskInstanceId, organizationId)
    } catch (err: any) {
      console.error("[Attachments] Failed to auto-transition task to IN_PROGRESS:", err.message)
    }

    // Log activity event (non-blocking)
    ActivityEventService.log({
      organizationId,
      taskInstanceId,
      eventType: "attachment.uploaded",
      actorId: userId,
      actorType: "user",
      summary: `${session.user.name || "Someone"} uploaded "${file.name}"`,
      metadata: { filename: file.name, fileSize: file.size, mimeType: file.type },
      targetId: attachment.id,
      targetType: "attachment",
    }).catch((err) => console.error("[ActivityEvent] attachment.uploaded failed:", err))

    return NextResponse.json({ attachment }, { status: 201 })
  } catch (error: any) {
    console.error("[API/task-instances/[id]/attachments] Error uploading attachment:", error)
    return NextResponse.json(
      { error: "Failed to upload attachment" },
      { status: 500 }
    )
  }
}
