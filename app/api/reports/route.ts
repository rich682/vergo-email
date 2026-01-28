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
import { ReportDefinitionService, ReportColumn, ReportFormulaRow } from "@/lib/services/report-definition.service"

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

    const body = await request.json()
    const { name, description, databaseId, columns, formulaRows } = body

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

    // Create the report definition
    const report = await ReportDefinitionService.createReportDefinition({
      name: name.trim(),
      description: description?.trim(),
      databaseId,
      columns: columns as ReportColumn[] | undefined,
      formulaRows: formulaRows as ReportFormulaRow[] | undefined,
      organizationId: user.organizationId,
      createdById: user.id,
    })

    return NextResponse.json({ report }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating report:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create report" },
      { status: 400 }
    )
  }
}
