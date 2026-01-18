import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { list } from "@vercel/blob"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // Allow up to 60 seconds for this operation

/**
 * GET /api/admin/backfill-file-urls
 * Backfill missing fileUrls for CollectedItems
 * 
 * Query params:
 *   - secret: Admin secret for authentication (required)
 *   - dryRun: If "true", only reports what would be fixed without making changes
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")
  const dryRun = searchParams.get("dryRun") === "true"
  
  // Verify admin secret
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  try {
    // Find all CollectedItems with fileKey but no fileUrl
    const itemsToFix = await prisma.collectedItem.findMany({
      where: {
        fileKey: { not: "" },
        OR: [
          { fileUrl: null },
          { fileUrl: "" }
        ]
      },
      select: {
        id: true,
        fileKey: true,
        filename: true,
        organizationId: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    })
    
    if (itemsToFix.length === 0) {
      return NextResponse.json({
        message: "No items need fixing",
        fixed: 0,
        failed: 0,
        total: 0
      })
    }
    
    if (dryRun) {
      return NextResponse.json({
        message: "Dry run - no changes made",
        itemsToFix: itemsToFix.map(item => ({
          id: item.id,
          filename: item.filename,
          fileKey: item.fileKey,
          createdAt: item.createdAt
        })),
        total: itemsToFix.length
      })
    }
    
    // Process each item
    let fixed = 0
    let failed = 0
    const results: Array<{ id: string; filename: string; status: string; url?: string }> = []
    
    for (const item of itemsToFix) {
      try {
        // Look up the URL from Vercel Blob storage
        const { blobs } = await list({
          prefix: item.fileKey,
          limit: 1,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        })
        
        if (blobs.length > 0) {
          const url = blobs[0].url
          
          await prisma.collectedItem.update({
            where: { id: item.id },
            data: { fileUrl: url }
          })
          
          fixed++
          results.push({
            id: item.id,
            filename: item.filename,
            status: "fixed",
            url: url.substring(0, 80) + "..."
          })
        } else {
          failed++
          results.push({
            id: item.id,
            filename: item.filename,
            status: "not_found_in_blob"
          })
        }
      } catch (error: any) {
        failed++
        results.push({
          id: item.id,
          filename: item.filename,
          status: `error: ${error.message}`
        })
      }
    }
    
    return NextResponse.json({
      message: "Backfill complete",
      fixed,
      failed,
      total: itemsToFix.length,
      results
    })
    
  } catch (error: any) {
    console.error("[Admin] Backfill file URLs error:", error)
    return NextResponse.json(
      { error: "Failed to backfill file URLs", message: error.message },
      { status: 500 }
    )
  }
}
