import { NextRequest, NextResponse } from "next/server"
import { list } from "@vercel/blob"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/debug-blob
 * Debug: List contents of Vercel Blob storage
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")
  const prefix = searchParams.get("prefix") || ""
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  try {
    const { blobs, cursor, hasMore } = await list({
      prefix: prefix,
      limit: 100,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    
    return NextResponse.json({
      blobCount: blobs.length,
      hasMore,
      blobs: blobs.map(b => ({
        pathname: b.pathname,
        url: b.url,
        size: b.size,
        uploadedAt: b.uploadedAt
      }))
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to list blobs", message: error.message },
      { status: 500 }
    )
  }
}
