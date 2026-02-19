/**
 * Reports API - Single Report Operations
 * 
 * GET /api/reports/[id] - Get a single report definition
 * PATCH /api/reports/[id] - Update a report definition
 * DELETE /api/reports/[id] - Delete a report definition
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { ReportDefinitionService, ReportColumn, ReportFormulaRow, ReportLayout, CompareMode, MetricRow } from "@/lib/services/report-definition.service"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get single report definition
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    
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

    if (!canPerformAction(session.user.role, "reports:view_definitions", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to view reports" }, { status: 403 })
    }

    const report = await ReportDefinitionService.getReportDefinition(id, user.organizationId)

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    return NextResponse.json({ report })
  } catch (error) {
    console.error("Error getting report:", error)
    return NextResponse.json(
      { error: "Failed to get report" },
      { status: 500 }
    )
  }
}

// PATCH - Update report definition
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    
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

    if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage reports" }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, cadence, layout, compareMode, columns, formulaRows, pivotColumnKey, metricRows, pivotFormulaColumns, filterColumnKeys, filterBindings, rowColumnKey, valueColumnKey, pivotSortConfig } = body

    // Check for duplicate name if name is being updated
    if (name && typeof name === "string" && name.trim()) {
      const existingReport = await prisma.reportDefinition.findFirst({
        where: {
          organizationId: user.organizationId,
          name: name.trim(),
          id: { not: id },
        },
        select: { id: true },
      })
      if (existingReport) {
        return NextResponse.json(
          { error: `A report with the name "${name.trim()}" already exists` },
          { status: 409 }
        )
      }
    }

    // Update the report definition
    const report = await ReportDefinitionService.updateReportDefinition(
      id,
      user.organizationId,
      {
        name: name?.trim(),
        description: description?.trim(),
        cadence,
        layout: layout as ReportLayout | undefined,
        compareMode: compareMode as CompareMode | undefined,
        columns: columns as ReportColumn[] | undefined,
        formulaRows: formulaRows as ReportFormulaRow[] | undefined,
        pivotColumnKey,
        metricRows: metricRows as MetricRow[] | undefined,
        pivotFormulaColumns,
        rowColumnKey,
        valueColumnKey,
        filterColumnKeys,
        filterBindings: filterBindings as Record<string, string[]> | null | undefined,
        pivotSortConfig,
      }
    )

    return NextResponse.json({ report })
  } catch (error: any) {
    console.error("Error updating report:", error)
    
    if (error.message === "Report definition not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to update report" },
      { status: 400 }
    )
  }
}

// DELETE - Delete report definition
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    
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

    if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage reports" }, { status: 403 })
    }

    // Check for linked tasks if this is a preflight check
    const url = new URL(request.url)
    const preflight = url.searchParams.get("preflight")

    if (preflight === "true") {
      const linkedTaskCount = await prisma.taskInstance.count({
        where: { reportDefinitionId: id },
      })
      return NextResponse.json({ linkedTaskCount })
    }

    await ReportDefinitionService.deleteReportDefinition(id, user.organizationId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting report:", error)
    
    if (error.message === "Report definition not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to delete report" },
      { status: 400 }
    )
  }
}
