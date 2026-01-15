import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { AttachmentService } from "@/lib/services/attachment.service"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

/**
 * GET /api/subtasks/[id]/attachments - List all attachments for a subtask
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
    const subtaskId = params.id

    // Verify subtask exists and belongs to organization
    const subtask = await prisma.subtask.findFirst({
      where: { id: subtaskId, organizationId }
    })

    if (!subtask) {
      return NextResponse.json({ error: "Subtask not found" }, { status: 404 })
    }

    const attachments = await AttachmentService.getBySubtaskId(subtaskId, organizationId)

    return NextResponse.json({ attachments })
  } catch (error: any) {
    console.error("[API/subtasks/[id]/attachments] Error listing attachments:", error)
    return NextResponse.json(
      { error: "Failed to list attachments", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/subtasks/[id]/attachments - Upload an attachment to a subtask
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
    const subtaskId = params.id

    // Verify subtask exists and belongs to organization
    const subtask = await prisma.subtask.findFirst({
      where: { id: subtaskId, organizationId }
    })

    if (!subtask) {
      return NextResponse.json({ error: "Subtask not found" }, { status: 404 })
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

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const attachment = await AttachmentService.create({
      organizationId,
      subtaskId,
      file: buffer,
      filename: file.name,
      mimeType: file.type || undefined,
      uploadedById: userId
    })

    return NextResponse.json({ attachment }, { status: 201 })
  } catch (error: any) {
    console.error("[API/subtasks/[id]/attachments] Error uploading attachment:", error)
    return NextResponse.json(
      { error: "Failed to upload attachment", message: error.message },
      { status: 500 }
    )
  }
}
