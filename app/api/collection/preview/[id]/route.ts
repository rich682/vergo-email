import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getStorageService } from "@/lib/services/storage.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/collection/preview/[id]
 * Preview a collected item inline (for iframe/object embedding)
 * 
 * Unlike the download endpoint, this serves files with:
 * - Content-Disposition: inline (allows browser to display)
 * - No X-Frame-Options (allows iframe embedding)
 * - Proper caching headers
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

    // Fetch the collected item
    const item = await prisma.collectedItem.findFirst({
      where: {
        id: itemId,
        organizationId
      }
    })

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // Determine content type
    const contentType = item.mimeType || "application/octet-stream"
    let fileBuffer: Buffer

    // Strategy 1: If we have a direct fileUrl (Vercel Blob), fetch from it
    if (item.fileUrl) {
      try {
        const response = await fetch(item.fileUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch from fileUrl: ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        fileBuffer = Buffer.from(arrayBuffer)
      } catch (error) {
        console.error("Error fetching from fileUrl:", error)
        // Fall through to storage download
        fileBuffer = null as any
      }
    }

    // Strategy 2: Fall back to storage service download
    if (!fileBuffer) {
      try {
        const storage = getStorageService()
        fileBuffer = await storage.download(item.fileKey)
      } catch (error) {
        console.error("Error downloading file from storage:", error)
        return NextResponse.json(
          { error: "Failed to retrieve file" },
          { status: 500 }
        )
      }
    }

    // Return file with inline disposition for preview
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(item.filename)}"`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    })
  } catch (error: any) {
    console.error("Error previewing collection item:", error)
    return NextResponse.json(
      { error: "Failed to preview file", message: error.message },
      { status: 500 }
    )
  }
}
