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

    const body = await request.json()
    const { name, description, layout, compareMode, columns, formulaRows, pivotColumnKey, metricRows, pivotFormulaColumns, filterColumnKeys } = body

    // Update the report definition
    const report = await ReportDefinitionService.updateReportDefinition(
      id,
      user.organizationId,
      {
        name: name?.trim(),
        description: description?.trim(),
        layout: layout as ReportLayout | undefined,
        compareMode: compareMode as CompareMode | undefined,
        columns: columns as ReportColumn[] | undefined,
        formulaRows: formulaRows as ReportFormulaRow[] | undefined,
        pivotColumnKey,
        metricRows: metricRows as MetricRow[] | undefined,
        pivotFormulaColumns,
        filterColumnKeys,
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
