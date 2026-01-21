import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/debug-collection
 * Debug: Check CollectedItem messageId values
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")
  const jobId = searchParams.get("jobId")
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  try {
    const where: any = {}
    if (jobId) where.jobId = jobId
    
    const items = await prisma.collectedItem.findMany({
      where,
      select: {
        id: true,
        filename: true,
        source: true,
        messageId: true,
        fileUrl: true,
        fileKey: true,
        createdAt: true,
        request: {
          select: {
            id: true,
            campaignName: true
          }
        },
        message: {
          select: {
            id: true,
            subject: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    })
    
    const summary = {
      total: items.length,
      withMessageId: items.filter(i => i.messageId).length,
      withoutMessageId: items.filter(i => !i.messageId).length,
      withFileUrl: items.filter(i => i.fileUrl).length,
      withoutFileUrl: items.filter(i => !i.fileUrl).length
    }
    
    return NextResponse.json({
      summary,
      items: items.map(i => ({
        id: i.id,
        filename: i.filename,
        source: i.source,
        messageId: i.messageId || "NULL",
        hasMessage: !!i.message,
        hasFileUrl: !!i.fileUrl,
        fileKey: i.fileKey.substring(0, 50) + "...",
        requestCampaign: i.request?.campaignName || "N/A",
        createdAt: i.createdAt
      }))
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch", message: error.message },
      { status: 500 }
    )
  }
}
