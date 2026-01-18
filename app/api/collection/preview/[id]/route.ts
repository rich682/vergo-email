import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET /api/collection/preview/[id]
 * Stream a collected item's file content for client-side preview
 * 
 * Returns the raw file bytes with appropriate content-type headers.
 * Used by PDF.js viewer and image preview components.
 */
export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const itemId = context.params.id
  
  try {
    // Require authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId

    // Fetch the collected item - use the direct organizationId field for access control
    const item = await prisma.collectedItem.findFirst({
      where: { 
        id: itemId,
        organizationId: organizationId 
      }
    })

    if (!item) {
      // Try without org check for debugging - maybe organizationId mismatch
      const itemAny = await prisma.collectedItem.findUnique({
        where: { id: itemId }
      })
      
      if (itemAny) {
        console.error(`[Preview API] Item found but org mismatch. Item org: ${itemAny.organizationId}, User org: ${organizationId}`)
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
      
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // We need a fileUrl to fetch from
    if (!item.fileUrl) {
      return NextResponse.json(
        { error: "File URL not available" },
        { status: 404 }
      )
    }

    // Fetch the file from Vercel Blob storage
    const fileResponse = await fetch(item.fileUrl)
    if (!fileResponse.ok) {
      console.error(`[Preview API] Failed to fetch file: ${fileResponse.status}`)
      return NextResponse.json(
        { error: "Failed to fetch file from storage" },
        { status: 502 }
      )
    }

    // Get the file as ArrayBuffer and return with proper headers
    const arrayBuffer = await fileResponse.arrayBuffer()
    const contentType = item.mimeType || "application/octet-stream"

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(item.filename)}"`,
        "Content-Length": arrayBuffer.byteLength.toString(),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    })
  } catch (error: any) {
    console.error("[Preview API] Error:", error)
    return NextResponse.json(
      { error: "Failed to preview file", message: error.message },
      { status: 500 }
    )
  }
}
