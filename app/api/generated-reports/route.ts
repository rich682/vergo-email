/**
 * Generated Reports API - List
 * 
 * GET /api/generated-reports - List generated reports with filters
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportGenerationService } from "@/lib/services/report-generation.service"

// GET - List generated reports
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const reportDefinitionId = searchParams.get("reportDefinitionId") || undefined
    const periodKey = searchParams.get("periodKey") || undefined
    const boardId = searchParams.get("boardId") || undefined
    const limitParam = searchParams.get("limit")
    const limit = limitParam ? parseInt(limitParam, 10) : 100

    // Fetch reports
    const reports = await ReportGenerationService.list({
      organizationId: user.organizationId,
      reportDefinitionId,
      periodKey,
      boardId,
      limit,
    })

    // Also fetch distinct periods for filtering
    const periods = await ReportGenerationService.getDistinctPeriods(user.organizationId)

    return NextResponse.json({ reports, periods })
  } catch (error) {
    console.error("Error listing generated reports:", error)
    return NextResponse.json(
      { error: "Failed to list generated reports" },
      { status: 500 }
    )
  }
}
