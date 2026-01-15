import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { AttachmentService } from "@/lib/services/attachment.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/attachments/[id] - Get download URL for an attachment
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
    const attachmentId = params.id

    const { url, filename } = await AttachmentService.getDownloadUrl(
      attachmentId,
      organizationId
    )

    return NextResponse.json({ url, filename })
  } catch (error: any) {
    console.error("[API/attachments/[id]] Error getting download URL:", error)
    
    if (error.message === "Attachment not found") {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to get download URL", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/attachments/[id] - Delete an attachment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const attachmentId = params.id

    await AttachmentService.delete(attachmentId, organizationId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[API/attachments/[id]] Error deleting attachment:", error)
    
    if (error.message === "Attachment not found") {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to delete attachment", message: error.message },
      { status: 500 }
    )
  }
}
