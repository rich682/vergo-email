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
  context: { params: { id: string } }
) {
  const itemId = context.params.id
  
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId

    console.log(`[Preview API] Fetching item: ${itemId} for org: ${organizationId}`)

    // Fetch the collected item
    const item = await prisma.collectedItem.findFirst({
      where: {
        id: itemId,
        organizationId
      }
    })

    if (!item) {
      console.log(`[Preview API] Item not found: ${itemId}`)
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    console.log(`[Preview API] Found item: ${item.filename}, fileUrl: ${item.fileUrl ? 'yes' : 'no'}, fileKey: ${item.fileKey}`)

    // Determine content type
    const contentType = item.mimeType || "application/octet-stream"
    let fileBuffer: Buffer | null = null
    let fetchError: string | null = null

    // Strategy 1: If we have a direct fileUrl (Vercel Blob), fetch from it
    if (item.fileUrl) {
      try {
        console.log(`[Preview API] Fetching from fileUrl: ${item.fileUrl.substring(0, 50)}...`)
        const response = await fetch(item.fileUrl)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        fileBuffer = Buffer.from(arrayBuffer)
        console.log(`[Preview API] Successfully fetched ${fileBuffer.length} bytes from fileUrl`)
      } catch (error: any) {
        console.error("[Preview API] Error fetching from fileUrl:", error.message)
        fetchError = error.message
      }
    }

    // Strategy 2: Fall back to storage service download
    if (!fileBuffer && item.fileKey) {
      try {
        console.log(`[Preview API] Falling back to storage download: ${item.fileKey}`)
        const storage = getStorageService()
        fileBuffer = await storage.download(item.fileKey)
        console.log(`[Preview API] Successfully downloaded ${fileBuffer.length} bytes from storage`)
      } catch (error: any) {
        console.error("[Preview API] Error downloading from storage:", error.message)
        fetchError = error.message
      }
    }

    // If we still don't have the file, return error
    if (!fileBuffer) {
      console.error(`[Preview API] Failed to retrieve file. Last error: ${fetchError}`)
      return NextResponse.json(
        { error: "Failed to retrieve file", details: fetchError },
        { status: 500 }
      )
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
    console.error("[Preview API] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to preview file", message: error.message },
      { status: 500 }
    )
  }
}
