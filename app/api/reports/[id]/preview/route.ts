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
      select: { organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Parse request body
    const body = await request.json()
    const { currentPeriodKey, compareMode, liveConfig } = body as {
      currentPeriodKey?: string
      compareMode?: CompareMode
      liveConfig?: {
        columns?: any[]
        formulaRows?: any[]
        pivotColumnKey?: string | null
        metricRows?: any[]
      }
    }

    // Validate compareMode if provided
    if (compareMode && !["none", "mom", "yoy"].includes(compareMode)) {
      return NextResponse.json(
        { error: "Invalid compareMode. Must be 'none', 'mom', or 'yoy'" },
        { status: 400 }
      )
    }

    // Execute preview
    const result = await ReportExecutionService.executePreview({
      reportDefinitionId: id,
      organizationId: user.organizationId,
      currentPeriodKey,
      compareMode: compareMode || "none",
      liveConfig, // Pass live config for preview without saving
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error executing preview:", error)
    
    if (error.message === "Report not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to execute preview" },
      { status: 500 }
    )
  }
}

// GET - Legacy preview (no period filtering)
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

    // Execute preview without period filtering
    const result = await ReportExecutionService.executePreview({
      reportDefinitionId: id,
      organizationId: user.organizationId,
      // No period filtering - uses all rows
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error rendering preview:", error)
    
    if (error.message === "Report not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to render preview" },
      { status: 500 }
    )
  }
}
