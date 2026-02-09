import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { AttachmentService } from "@/lib/services/attachment.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/attachments/download/[id] - Get download URL for an attachment
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
    console.error("[API/attachments/download/[id]] Error getting download URL:", error)
    
    if (error.message === "Attachment not found") {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to get download URL" },
      { status: 500 }
    )
  }
}
