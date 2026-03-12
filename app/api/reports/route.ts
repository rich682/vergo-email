/**
 * Reports API - List and Create
 * 
 * GET /api/reports - List all report definitions for the organization
 * POST /api/reports - Create a new report definition
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { ReportDefinitionService, ReportColumn, ReportFormulaRow, ReportCadence, ReportLayout, CompareMode, MetricRow } from "@/lib/services/report-definition.service"

// GET - List report definitions
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const canView = canPerformAction(session.user.role, "reports:view_all_definitions", session.user.orgActionPermissions)

    const { searchParams } = new URL(request.url)
    const myItems = searchParams.get("myItems") === "true"

    // If user has no view permission, only return reports they're an explicit viewer of
    // (supports MEMBER implicit report access via task detail)
    if (!canView) {
      const viewerEntries = await prisma.reportDefinitionViewer.findMany({
        where: { userId: session.user.id },
        select: { reportDefinitionId: true },
      })
      if (viewerEntries.length === 0) {
        return NextResponse.json({ reports: [] })
      }
      const viewableIds = new Set(viewerEntries.map(v => v.reportDefinitionId))
      const reports = await ReportDefinitionService.listReportDefinitions(session.user.organizationId)
      return NextResponse.json({ reports: reports.filter((r: any) => viewableIds.has(r.id)) })
    }

    const reports = await ReportDefinitionService.listReportDefinitions(session.user.organizationId)

    // myItems: user explicitly wants only their own reports
    if (myItems) {
      const filteredReports = reports.filter((r: any) => r.createdById === session.user.id)
      return NextResponse.json({ reports: filteredReports })
    }

    return NextResponse.json({ reports })
  } catch (error) {
    console.error("Error listing reports:", error)
    return NextResponse.json(
      { error: "Failed to list reports" },
      { status: 500 }
    )
  }
}

// POST - Create report definition
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage reports" }, { status: 403 })
    }

    // Check if advanced board types is enabled
    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { features: true },
    })
    const orgFeatures = (organization?.features as Record<string, any>) || {}
    const advancedBoardTypes = orgFeatures.advancedBoardTypes === true

    const body = await request.json()
    const {
      name, description, databaseId, dateColumnKey,
      layout, compareMode, columns, formulaRows, pivotColumnKey, metricRows,
      rowColumnKey, valueColumnKey
    } = body

    // Default cadence to monthly when advanced board types is off
    const cadence = advancedBoardTypes ? body.cadence : "monthly"

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Report name is required" },
        { status: 400 }
      )
    }

    // Check for duplicate name within the organization
    const existingReport = await prisma.reportDefinition.findFirst({
      where: { organizationId: session.user.organizationId, name: name.trim() },
      select: { id: true },
    })
    if (existingReport) {
      return NextResponse.json(
        { error: `A report with the name "${name.trim()}" already exists` },
        { status: 409 }
      )
    }

    if (!databaseId || typeof databaseId !== "string") {
      return NextResponse.json(
        { error: "Database ID is required" },
        { status: 400 }
      )
    }

    // Validate cadence
    const validCadences = ["daily", "monthly", "quarterly", "annual"]
    if (!cadence || !validCadences.includes(cadence)) {
      return NextResponse.json(
        { error: `Cadence is required and must be one of: ${validCadences.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate pivot column (required for matrix reports)
    if (!pivotColumnKey || typeof pivotColumnKey !== "string") {
      return NextResponse.json(
        { error: "Pivot column is required" },
        { status: 400 }
      )
    }

    // Default dateColumnKey to pivotColumnKey if not provided
    const effectiveDateColumnKey = (dateColumnKey && typeof dateColumnKey === "string") ? dateColumnKey : pivotColumnKey

    // Validate compareMode if provided
    const validCompareModes = ["none", "mom", "yoy"]
    if (compareMode && !validCompareModes.includes(compareMode)) {
      return NextResponse.json(
        { error: `Compare mode must be one of: ${validCompareModes.join(", ")}` },
        { status: 400 }
      )
    }

    // Create the report definition
    const report = await ReportDefinitionService.createReportDefinition({
      name: name.trim(),
      description: description?.trim(),
      databaseId,
      cadence: cadence as ReportCadence,
      dateColumnKey: effectiveDateColumnKey,
      layout: (layout as ReportLayout) || "pivot",
      compareMode: (compareMode as CompareMode) || "none",
      columns: columns as ReportColumn[] | undefined,
      formulaRows: formulaRows as ReportFormulaRow[] | undefined,
      pivotColumnKey,
      metricRows: metricRows as MetricRow[] | undefined,
      rowColumnKey,
      valueColumnKey,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
    })

    return NextResponse.json({ report }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating report:", error)
    return NextResponse.json(
      { error: "Failed to create report" },
      { status: 400 }
    )
  }
}
