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
  { params }: { params: Promise<{ id: string }> }
) {
  // In Next.js 14, params may be a Promise
  const { id: itemId } = await params
  
  console.log(`[Preview API] Request for item: ${itemId}`)
  
  try {
    // Require authentication - IDs are unguessable cuids, so auth is sufficient
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      console.log(`[Preview API] Unauthorized - no session`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`[Preview API] User authenticated: ${session.user.id}`)

    // Fetch the collected item by ID
    // Since IDs are unguessable cuids, having the ID implies authorization
    const item = await prisma.collectedItem.findUnique({
      where: { id: itemId }
    })

    console.log(`[Preview API] Found item: ${!!item}`)

    if (!item) {
      // Debug: check if item exists at all in the table
      const count = await prisma.collectedItem.count()
      console.error(`[Preview API] Item ${itemId} not found. Total CollectedItems in DB: ${count}`)
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    console.log(`[Preview API] Item details: filename=${item.filename}, fileUrl=${item.fileUrl ? 'present' : 'missing'}`)

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
