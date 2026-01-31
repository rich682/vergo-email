/**
 * Report Insights API
 * 
 * POST /api/reports/[id]/insights - Generate AI-powered insights for a report
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportInsightsService } from "@/lib/services/report-insights.service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const reportId = params.id
    
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    
    const { periodKey, filterBindings, compareMode } = body as {
      periodKey: string
      filterBindings?: Record<string, string[]>
      compareMode?: "none" | "mom" | "yoy"
    }

    // Validate required fields
    if (!periodKey) {
      return NextResponse.json(
        { error: "periodKey is required" },
        { status: 400 }
      )
    }

    // Verify report exists and belongs to org
    const report = await prisma.reportDefinition.findFirst({
      where: {
        id: reportId,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        name: true,
        cadence: true,
      },
    })

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      )
    }

    // Generate insights
    const insights = await ReportInsightsService.generateInsights({
      reportDefinitionId: reportId,
      organizationId: user.organizationId,
      periodKey,
      filterBindings,
      compareMode: compareMode || "mom",
    })

    // Build filter summary for response context
    let filterSummary = "All Data"
    if (filterBindings && Object.keys(filterBindings).length > 0) {
      const parts = Object.entries(filterBindings)
        .filter(([_, values]) => values.length > 0)
        .map(([key, values]) => values.length === 1 ? values[0] : `${values.length} ${key}`)
      if (parts.length > 0) {
        filterSummary = parts.join(", ")
      }
    }

    return NextResponse.json({
      insights,
      context: {
        reportId: report.id,
        reportName: report.name,
        periodKey,
        filterSummary,
      },
    })
  } catch (error: any) {
    console.error("[ReportInsights] Error generating insights:", error)

    // Handle specific error types
    if (error.message === "Report not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    if (error.message?.includes("OPENAI_API_KEY")) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Failed to generate insights" },
      { status: 500 }
    )
  }
}
