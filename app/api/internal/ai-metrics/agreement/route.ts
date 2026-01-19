import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CampaignType } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/internal/ai-metrics/agreement
 * Returns AI vs Human agreement metrics for the feedback loop
 * 
 * Query params:
 *   - campaignType: filter by campaign type (optional)
 *   - startDate: ISO date string for range start (optional)
 *   - endDate: ISO date string for range end (optional)
 * 
 * Auth: Requires admin role or ADMIN_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    // Auth: Allow either admin user or ADMIN_SECRET
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get("secret")
    
    let organizationId: string | null = null
    
    if (secret && secret === process.env.ADMIN_SECRET) {
      // Admin secret provided - allow access (for internal tools)
      // Get organizationId from query if provided, otherwise return global metrics
      organizationId = searchParams.get("organizationId")
    } else {
      // Check user session
      const session = await getServerSession(authOptions)
      if (!session?.user?.organizationId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      
      // Only admins can access metrics
      if (session.user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 }
        )
      }
      
      organizationId = session.user.organizationId
    }

    // Parse query params
    const campaignTypeParam = searchParams.get("campaignType")
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")

    // Build where clause
    const where: any = {
      humanActedAt: { not: null } // Only include decisions that have been acted on
    }
    
    if (organizationId) {
      where.organizationId = organizationId
    }
    
    if (campaignTypeParam && Object.values(CampaignType).includes(campaignTypeParam as CampaignType)) {
      where.campaignType = campaignTypeParam
    }
    
    if (startDateParam) {
      where.humanActedAt = { 
        ...where.humanActedAt, 
        gte: new Date(startDateParam) 
      }
    }
    
    if (endDateParam) {
      where.humanActedAt = { 
        ...where.humanActedAt, 
        lte: new Date(endDateParam) 
      }
    }

    // Get total decisions and agreement count
    const totalDecisions = await prisma.aIRecommendation.count({ where })
    
    const agreementCount = await prisma.aIRecommendation.count({
      where: {
        ...where,
        agreedWithAI: true
      }
    })

    const agreementRate = totalDecisions > 0 
      ? Math.round((agreementCount / totalDecisions) * 1000) / 1000 
      : 0

    // Get breakdown by campaign type
    const breakdownData = await prisma.aIRecommendation.groupBy({
      by: ["campaignType", "agreedWithAI"],
      where,
      _count: true
    })

    // Process breakdown into a more usable format
    const breakdown: Record<string, { total: number; agreed: number; rate: number }> = {}
    
    for (const row of breakdownData) {
      const type = row.campaignType || "UNKNOWN"
      if (!breakdown[type]) {
        breakdown[type] = { total: 0, agreed: 0, rate: 0 }
      }
      breakdown[type].total += row._count
      if (row.agreedWithAI === true) {
        breakdown[type].agreed += row._count
      }
    }

    // Calculate rates for each type
    for (const type in breakdown) {
      breakdown[type].rate = breakdown[type].total > 0
        ? Math.round((breakdown[type].agreed / breakdown[type].total) * 1000) / 1000
        : 0
    }

    return NextResponse.json({
      totalDecisions,
      agreementCount,
      agreementRate,
      breakdown,
      filters: {
        organizationId,
        campaignType: campaignTypeParam || null,
        startDate: startDateParam || null,
        endDate: endDateParam || null
      }
    })
  } catch (error: any) {
    console.error("[API/internal/ai-metrics/agreement] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch metrics", message: error.message },
      { status: 500 }
    )
  }
}
