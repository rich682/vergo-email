/**
 * Ensure Generated Report for Task
 * 
 * POST /api/generated-reports/ensure-for-task
 * 
 * Ensures a GeneratedReport exists for a task's configured report.
 * This is called when viewing a report in a task to make it visible
 * in the Reports page automatically.
 * 
 * Idempotent: If report already exists for task+period, returns success without changes.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportGenerationService } from "@/lib/services/report-generation.service"
import { canPerformAction } from "@/lib/permissions"

export const maxDuration = 30
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

    if (!canPerformAction(session.user.role, "reports:generate", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to generate reports" }, { status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { taskInstanceId, reportDefinitionId, periodKey, filterBindings } = body as {
      taskInstanceId?: string
      reportDefinitionId?: string
      periodKey?: string
      filterBindings?: Record<string, string[]>
    }

    // Validate required fields
    if (!taskInstanceId) {
      return NextResponse.json(
        { error: "taskInstanceId is required" },
        { status: 400 }
      )
    }

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

    // Verify the task instance exists and belongs to this org
    const taskInstance = await prisma.taskInstance.findFirst({
      where: {
        id: taskInstanceId,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        boardId: true,
        ownerId: true,
        reportDefinitionId: true,
        reportFilterBindings: true,
        collaborators: { select: { userId: true } },
      },
    })

    if (!taskInstance) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Verify user has access to this task (owner, collaborator, or admin)
    const isOwner = taskInstance.ownerId === user.id
    const isCollaborator = taskInstance.collaborators.some(c => c.userId === user.id)
    const userWithRole = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    })
    const isAdmin = userWithRole?.role === "ADMIN"

    if (!isOwner && !isCollaborator && !isAdmin) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    // Strict viewer check: admin bypasses, everyone else must be a report definition viewer
    if (!isAdmin) {
      const isReportViewer = await prisma.reportDefinitionViewer.findFirst({
        where: { reportDefinitionId, userId: user.id },
      })
      if (!isReportViewer) {
        return NextResponse.json(
          { error: "You do not have viewer access to this report" },
          { status: 403 }
        )
      }
    }

    // Verify the report definition matches what's configured on the task
    if (taskInstance.reportDefinitionId !== reportDefinitionId) {
      return NextResponse.json(
        { error: "Report definition does not match task configuration" },
        { status: 403 }
      )
    }

    // Resolve filters: ReportDefinition.filterBindings takes priority over task-level (legacy)
    const reportDef = await prisma.reportDefinition.findUnique({
      where: { id: reportDefinitionId },
      select: { filterBindings: true },
    })
    const reportDefFilters = reportDef?.filterBindings as Record<string, string[]> | null
    const effectiveFilterBindings = (reportDefFilters && Object.keys(reportDefFilters).length > 0)
      ? reportDefFilters
      : (taskInstance.reportFilterBindings as Record<string, string[]>) || undefined

    // Check if a generated report already exists for this task+period
    const existingReport = await (prisma as any).generatedReport.findFirst({
      where: {
        taskInstanceId,
        periodKey,
        organizationId: user.organizationId,
      },
      select: { id: true },
    })

    if (existingReport) {
      // Report already exists, return success (idempotent)
      return NextResponse.json({ 
        success: true, 
        created: false,
        message: "Report already exists for this task and period",
        reportId: existingReport.id,
      })
    }

    // Generate and store the report using server-side filters
    const report = await ReportGenerationService.generateForPeriod({
      organizationId: user.organizationId,
      reportDefinitionId,
      filterBindings: effectiveFilterBindings,
      taskInstanceId,
      boardId: taskInstance.boardId!,
      periodKey,
      generatedBy: user.id,
    })

    return NextResponse.json({ 
      success: true, 
      created: true,
      message: "Report created successfully",
      reportId: report.id,
    }, { status: 201 })

  } catch (error: any) {
    console.error("Error ensuring task report:", error)
    
    if (error.message === "Report definition not found") {
      return NextResponse.json({ error: "Report template not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to ensure task report" },
      { status: 500 }
    )
  }
}
