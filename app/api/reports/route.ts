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
import { canWriteToModule } from "@/lib/permissions"
import { ReportDefinitionService, ReportColumn, ReportFormulaRow, ReportCadence, ReportLayout, CompareMode, MetricRow } from "@/lib/services/report-definition.service"

// GET - List report definitions
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

    const reports = await ReportDefinitionService.listReportDefinitions(user.organizationId)

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

    if (!canWriteToModule(session.user.role, "reports", session.user.orgRoleDefaults)) {
      return NextResponse.json({ error: "Read-only access" }, { status: 403 })
    }

    const body = await request.json()
    const {
      name, description, databaseId, cadence, dateColumnKey,
      layout, compareMode, columns, formulaRows, pivotColumnKey, metricRows,
      rowColumnKey, valueColumnKey
    } = body

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Report name is required" },
        { status: 400 }
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

    // Validate dateColumnKey
    if (!dateColumnKey || typeof dateColumnKey !== "string") {
      return NextResponse.json(
        { error: "Date column is required" },
        { status: 400 }
      )
    }

    // Validate layout if provided
    const validLayouts = ["standard", "pivot", "accounting"]
    if (layout && !validLayouts.includes(layout)) {
      return NextResponse.json(
        { error: `Layout must be one of: ${validLayouts.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate pivot layout requirements
    if (layout === "pivot" && !pivotColumnKey) {
      return NextResponse.json(
        { error: "Pivot layout requires a pivot column" },
        { status: 400 }
      )
    }

    // Validate accounting layout requirements
    if (layout === "accounting") {
      if (!pivotColumnKey || !rowColumnKey || !valueColumnKey) {
        return NextResponse.json(
          { error: "Accounting layout requires row column, period column, and value column" },
          { status: 400 }
        )
      }
    }

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
      dateColumnKey,
      layout: (layout as ReportLayout) || "standard",
      compareMode: (compareMode as CompareMode) || "none",
      columns: columns as ReportColumn[] | undefined,
      formulaRows: formulaRows as ReportFormulaRow[] | undefined,
      pivotColumnKey,
      metricRows: metricRows as MetricRow[] | undefined,
      rowColumnKey,
      valueColumnKey,
      organizationId: user.organizationId,
      createdById: user.id,
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
