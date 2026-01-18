import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CollectionService } from "@/lib/services/collection.service"
import { getStorageService } from "@/lib/services/storage.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/jobs/[id]/collection/download?itemId=xxx
 * Download a single collected item
 * 
 * For Vercel Blob storage, redirects to the public URL for efficient download.
 * For local storage, streams the file through the server.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const { id: jobId } = await params

    // Get itemId from query params
    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get("itemId")

    if (!itemId) {
      return NextResponse.json({ error: "itemId required" }, { status: 400 })
    }

    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Get the item
    const item = await CollectionService.getById(itemId, organizationId)

    if (!item || item.jobId !== jobId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    const storage = getStorageService()

    // If we have a stored fileUrl (from Vercel Blob), redirect to it
    // Don't add download param - let browser decide based on content-type
    if (item.fileUrl) {
      return NextResponse.redirect(item.fileUrl)
    }

    // Fallback: download file from storage and stream it
    const fileBuffer = await storage.download(item.fileKey)

    // Return as downloadable file
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": item.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${item.filename}"`,
        "Content-Length": fileBuffer.length.toString()
      }
    })
  } catch (error: any) {
    console.error("Error downloading collection item:", error)
    return NextResponse.json(
      { error: "Failed to download file", message: error.message },
      { status: 500 }
    )
  }
}
