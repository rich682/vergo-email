/**
 * Reports Preview API
 *
 * POST /api/reports/[id]/preview - Execute report with period filtering and variance
 * GET /api/reports/[id]/preview - Legacy: render preview without period filtering
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportExecutionService } from "@/lib/services/report-execution.service"
import { canPerformAction } from "@/lib/permissions"
import type { CompareMode } from "@/lib/utils/period"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST - Execute preview with period filtering and variance
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

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

    // Parse request body
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { currentPeriodKey, compareMode, liveConfig, filters, taskInstanceId } = body as {
      currentPeriodKey?: string
      compareMode?: CompareMode
      liveConfig?: {
        columns?: any[]
        formulaRows?: any[]
        pivotColumnKey?: string | null
        metricRows?: any[]
        pivotFormulaColumns?: any[]
        pivotSortConfig?: any
      }
      filters?: Record<string, unknown>
      taskInstanceId?: string
    }

    // Validate compareMode if provided
    if (compareMode && !["none", "mom", "yoy"].includes(compareMode)) {
      return NextResponse.json(
        { error: "Invalid compareMode. Must be 'none', 'mom', or 'yoy'" },
        { status: 400 }
      )
    }

    // Determine effective filters based on context
    let effectiveFilters: Record<string, string[]> | undefined

    if (taskInstanceId) {
      // Task-scoped preview: read filters from the task record (server-side enforcement)
      const task = await prisma.taskInstance.findFirst({
        where: { id: taskInstanceId, organizationId: user.organizationId },
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
      if (task.reportDefinitionId !== id) {
        return NextResponse.json(
          { error: "Report definition does not match task configuration" },
          { status: 403 }
        )
      }

      // Verify user has access to this task
      const isOwner = task.ownerId === user.id
      const isCollaborator = task.collaborators.some(c => c.userId === user.id)
      const isAdmin = user.role === "ADMIN"
      if (!isOwner && !isCollaborator && !isAdmin) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }

      // Strict viewer check: admin bypasses, everyone else must be a report definition viewer
      if (!isAdmin) {
        const isReportViewer = await prisma.reportDefinitionViewer.findFirst({
          where: { reportDefinitionId: id, userId: user.id },
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
        where: { id },
        select: { filterBindings: true },
      })
      const reportDefFilters = reportDef?.filterBindings as Record<string, string[]> | null
      effectiveFilters = (reportDefFilters && Object.keys(reportDefFilters).length > 0)
        ? reportDefFilters
        : (task.reportFilterBindings as Record<string, string[]>) || undefined

    } else {
      // No task context: admin/manager previewing in report builder
      if (!canPerformAction(user.role, "reports:manage", session.user.orgActionPermissions)) {
        return NextResponse.json(
          { error: "Permission denied — reports:manage required for standalone preview" },
          { status: 403 }
        )
      }
      // Admin can use any filters (they're configuring)
      effectiveFilters = filters as Record<string, string[]> | undefined
    }

    // Execute preview
    const result = await ReportExecutionService.executePreview({
      reportDefinitionId: id,
      organizationId: user.organizationId,
      currentPeriodKey,
      compareMode: compareMode || "none",
      liveConfig,
      filters: effectiveFilters,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error executing preview:", error)

    if (error.message === "Report not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to execute preview" },
      { status: 500 }
    )
  }
}

// GET - Legacy preview (no period filtering) — requires reports:manage
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true, role: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Legacy preview is only used by report builder — require reports:manage
    if (!canPerformAction(user.role, "reports:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    // Execute preview without period filtering
    const result = await ReportExecutionService.executePreview({
      reportDefinitionId: id,
      organizationId: user.organizationId,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error rendering preview:", error)

    if (error.message === "Report not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "Failed to render preview" },
      { status: 500 }
    )
  }
}
