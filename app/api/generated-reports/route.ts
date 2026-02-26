/**
 * Generated Reports API - List and Create
 * 
 * GET /api/generated-reports - List generated reports with filters
 * POST /api/generated-reports - Create a manual report
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportGenerationService } from "@/lib/services/report-generation.service"
import { canPerformAction } from "@/lib/permissions"

export const maxDuration = 45;
// GET - List generated reports
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reports:view_generated", session.user.orgActionPermissions)) {
      return NextResponse.json({ reports: [], periods: [] })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const reportDefinitionId = searchParams.get("reportDefinitionId") || undefined
    const periodKey = searchParams.get("periodKey") || undefined
    const boardId = searchParams.get("boardId") || undefined
    const limitParam = searchParams.get("limit")
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 100
    const limit = isNaN(parsedLimit) ? 100 : Math.max(1, Math.min(parsedLimit, 1000))

    // Determine viewer filter: users with view_all_definitions see all, others only see reports they're viewers of
    const viewerUserId = canPerformAction(session.user.role, "reports:view_all_definitions", session.user.orgActionPermissions) ? undefined : session.user.id

    // Fetch reports
    const reports = await ReportGenerationService.list({
      organizationId: session.user.organizationId,
      reportDefinitionId,
      periodKey,
      boardId,
      limit,
      viewerUserId, // Pass viewer filter for non-admins
    })

    // Also fetch distinct periods for filtering (only from visible reports for non-admins)
    const periods = await ReportGenerationService.getDistinctPeriods(session.user.organizationId, viewerUserId)

    return NextResponse.json({ reports, periods })
  } catch (error) {
    console.error("Error listing generated reports:", error)
    return NextResponse.json(
      { error: "Failed to list generated reports" },
      { status: 500 }
    )
  }
}

// POST - Create a manual report
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reports:generate", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to generate reports" }, { status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    
    const { reportDefinitionId, filterBindings, periodKey, name, viewerIds } = body as {
      reportDefinitionId?: string
      filterBindings?: Record<string, string[]>
      periodKey?: string
      name?: string
      viewerIds?: string[]
    }

    // Validate required fields
    if (!reportDefinitionId) {
      return NextResponse.json(
        { error: "reportDefinitionId is required" },
        { status: 400 }
      )
    }

    if (!periodKey) {
      return NextResponse.json(
        { error: "periodKey is required" },
        { status: 400 }
      )
    }

    // Create the manual report
    const report = await ReportGenerationService.createManualReport({
      organizationId: session.user.organizationId,
      reportDefinitionId,
      filterBindings,
      periodKey,
      createdBy: session.user.id,
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
    })

    // Add viewers if specified
    if (viewerIds && viewerIds.length > 0) {
      // Validate viewerIds are valid users in the same org
      const validUsers = await prisma.user.findMany({
        where: {
          id: { in: viewerIds },
          organizationId: session.user.organizationId,
        },
        select: { id: true },
      })
      
      const validUserIds = validUsers.map(u => u.id)
      
      if (validUserIds.length > 0) {
        await prisma.generatedReportViewer.createMany({
          data: validUserIds.map(userId => ({
            generatedReportId: report.id,
            userId,
            addedBy: session.user.id,
          })),
          skipDuplicates: true,
        })
      }
    }

    return NextResponse.json({ report }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating manual report:", error)
    
    if (error.message === "Report definition not found") {
      return NextResponse.json({ error: "Report template not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to create report" },
      { status: 400 }
    )
  }
}
