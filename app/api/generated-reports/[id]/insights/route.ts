/**
 * Generated Report Insights API
 * 
 * GET /api/generated-reports/[id]/insights - Get cached insights (or generate if not cached)
 * POST /api/generated-reports/[id]/insights - Force regenerate insights
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportInsightsService } from "@/lib/services/report-insights.service"
import { canPerformAction } from "@/lib/permissions"

export const maxDuration = 30
interface CachedInsights {
  insights: any
  context: {
    reportId: string
    reportName: string
    periodKey: string
    filterSummary: string
  }
  cachedAt: string
}

// GET - Get cached insights (generate if not cached)
export async function GET(
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
      select: { id: true, organizationId: true, role: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    if (!canPerformAction(user.role, "reports:view_generated", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to view reports" }, { status: 403 })
    }

    const generatedReportId = params.id

    // Fetch the generated report
    const report = await prisma.generatedReport.findFirst({
      where: {
        id: generatedReportId,
        organizationId: user.organizationId,
      },
      include: {
        reportDefinition: {
          select: { id: true, name: true, cadence: true },
        },
      },
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Access check: users with view_all_definitions see all, others must be an explicit viewer
    if (!canPerformAction(user.role, "reports:view_all_definitions", session.user.orgActionPermissions)) {
      const isViewer = await prisma.generatedReportViewer.findUnique({
        where: { generatedReportId_userId: { generatedReportId: generatedReportId, userId: user.id } }
      })
      if (!isViewer) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    }

    // Check for cached insights in the report data
    const reportData = report.data as any
    if (reportData?.cachedInsights) {
      return NextResponse.json({
        insights: reportData.cachedInsights.insights,
        context: reportData.cachedInsights.context,
        cached: true,
        cachedAt: reportData.cachedInsights.cachedAt,
      })
    }

    // No cached insights - generate new ones
    const insights = await generateAndCacheInsights(report, user.organizationId)

    return NextResponse.json({
      ...insights,
      cached: false,
    })
  } catch (error: any) {
    console.error("[GeneratedReportInsights] Error:", error)
    return NextResponse.json(
      { error: "Failed to get insights" },
      { status: 500 }
    )
  }
}

// POST - Force regenerate insights
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
      select: { id: true, organizationId: true, role: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    if (!canPerformAction(user.role, "reports:view_generated", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to view reports" }, { status: 403 })
    }

    const generatedReportId = params.id

    // Fetch the generated report
    const report = await prisma.generatedReport.findFirst({
      where: {
        id: generatedReportId,
        organizationId: user.organizationId,
      },
      include: {
        reportDefinition: {
          select: { id: true, name: true, cadence: true },
        },
      },
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Access check: users with view_all_definitions see all, others must be an explicit viewer
    if (!canPerformAction(user.role, "reports:view_all_definitions", session.user.orgActionPermissions)) {
      const isViewer = await prisma.generatedReportViewer.findUnique({
        where: { generatedReportId_userId: { generatedReportId, userId: user.id } }
      })
      if (!isViewer) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    }

    // Force regenerate insights
    const insights = await generateAndCacheInsights(report, user.organizationId)

    return NextResponse.json({
      ...insights,
      cached: false,
      regenerated: true,
    })
  } catch (error: any) {
    console.error("[GeneratedReportInsights] Error regenerating:", error)
    return NextResponse.json(
      { error: "Failed to regenerate insights" },
      { status: 500 }
    )
  }
}

// Helper function to generate and cache insights
async function generateAndCacheInsights(
  report: any,
  organizationId: string
): Promise<{ insights: any; context: any }> {
  const reportData = report.data as any

  // Build filter summary
  let filterSummary = "All Data"
  if (reportData?.sliceName) {
    filterSummary = reportData.sliceName
  }

  // Generate insights using the report definition
  const insights = await ReportInsightsService.generateInsights({
    reportDefinitionId: report.reportDefinitionId,
    organizationId,
    periodKey: report.periodKey,
    filterBindings: reportData?.filterBindings || {},
    compareMode: reportData?.compareMode || "mom",
  })

  const context = {
    reportId: report.id,
    reportName: reportData?.reportName || report.reportDefinition?.name || "Untitled Report",
    periodKey: report.periodKey,
    filterSummary,
  }

  // Cache the insights in the report data
  const cachedInsights: CachedInsights = {
    insights,
    context,
    cachedAt: new Date().toISOString(),
  }

  await prisma.generatedReport.update({
    where: { id: report.id },
    data: {
      data: {
        ...reportData,
        cachedInsights,
      },
    },
  })

  return { insights, context }
}
