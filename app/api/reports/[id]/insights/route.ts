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
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: reportId } = await params

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { periodKey, filterBindings, compareMode, taskInstanceId } = body as {
      periodKey: string
      filterBindings?: Record<string, string[]>
      compareMode?: "none" | "mom" | "yoy"
      taskInstanceId?: string
    }

    // Validate required fields
    if (!periodKey) {
      return NextResponse.json(
        { error: "periodKey is required" },
        { status: 400 }
      )
    }

    // Determine effective filters based on context
    let effectiveFilterBindings: Record<string, string[]> | undefined

    if (taskInstanceId) {
      // Task-scoped insights: read filters from the task record (server-side enforcement)
      const task = await prisma.taskInstance.findFirst({
        where: { id: taskInstanceId, organizationId: session.user.organizationId },
        select: {
          id: true,
          reportDefinitionId: true,
          reportFilterBindings: true,
          ownerId: true,
          collaborators: { select: { userId: true } },
        },
      })

      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 })
      }

      // Verify the report definition matches what's configured on the task
      if (task.reportDefinitionId !== reportId) {
        return NextResponse.json(
          { error: "Report definition does not match task configuration" },
          { status: 403 }
        )
      }

      // Verify user has access to this task
      const isOwner = task.ownerId === session.user.id
      const isCollaborator = task.collaborators.some(c => c.userId === session.user.id)
      const isAdmin = session.user.role === "ADMIN"
      if (!isOwner && !isCollaborator && !isAdmin) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }

      // Viewer check: admin and users with view_all_definitions bypass, everyone else must be a report definition viewer
      const canViewAllReports = canPerformAction(session.user.role, "reports:view_all_definitions", session.user.orgActionPermissions)
      if (!isAdmin && !canViewAllReports) {
        const isReportViewer = await prisma.reportDefinitionViewer.findFirst({
          where: { reportDefinitionId: reportId, userId: session.user.id },
        })
        if (!isReportViewer) {
          return NextResponse.json(
            { error: "You do not have viewer access to this report" },
            { status: 403 }
          )
        }
      }

      // Resolve filters: ReportDefinition.filterBindings takes priority over task-level (legacy)
      const reportDef = await prisma.reportDefinition.findUnique({
        where: { id: reportId },
        select: { filterBindings: true },
      })
      const reportDefFilters = reportDef?.filterBindings as Record<string, string[]> | null
      effectiveFilterBindings = (reportDefFilters && Object.keys(reportDefFilters).length > 0)
        ? reportDefFilters
        : (task.reportFilterBindings as Record<string, string[]>) || undefined

    } else {
      // No task context: admin/manager using report builder
      if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
        return NextResponse.json(
          { error: "Permission denied — reports:manage required for standalone insights" },
          { status: 403 }
        )
      }
      // Admin can use any filters
      effectiveFilterBindings = filterBindings
    }

    // Verify report exists and belongs to org
    const report = await prisma.reportDefinition.findFirst({
      where: {
        id: reportId,
        organizationId: session.user.organizationId,
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
      organizationId: session.user.organizationId,
      periodKey,
      filterBindings: effectiveFilterBindings,
      compareMode: compareMode || "mom",
    })

    // Build filter summary for response context
    let filterSummary = "All Data"
    if (effectiveFilterBindings && Object.keys(effectiveFilterBindings).length > 0) {
      const parts = Object.entries(effectiveFilterBindings)
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
      { error: "Failed to generate insights" },
      { status: 500 }
    )
  }
}
