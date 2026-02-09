import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getStorageService } from "@/lib/services/storage.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/collection/download/[id]
 * Download a collected item directly by its ID
 * 
 * This endpoint doesn't require a jobId, making it suitable for:
 * - Global collection views where items may not have a taskInstanceId
 * - Direct downloads from any context
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
    const itemId = params.id

    // Get the item, verifying it belongs to this organization
    const item = await prisma.collectedItem.findFirst({
      where: { 
        id: itemId, 
        organizationId 
      }
    })

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    const storage = getStorageService()

    // If we have a stored fileUrl (from Vercel Blob), redirect to it
    if (item.fileUrl) {
      return NextResponse.redirect(item.fileUrl)
    }

    // Fallback: download file from storage and stream it
    const fileBuffer = await storage.download(item.fileKey)

    // Return as downloadable file
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": item.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${item.filename}"`,
        "Content-Length": fileBuffer.length.toString()
      }
    })
  } catch (error: any) {
    console.error("Error downloading collection item:", error)
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    )
  }
}
