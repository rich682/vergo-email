/**
 * Reports Preview API
 * 
 * GET /api/reports/[id]/preview - Render report with sample data from database
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportDefinitionService } from "@/lib/services/report-definition.service"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Render preview
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

    // Get limit from query params (default 100)
    const url = new URL(request.url)
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? parseInt(limitParam, 10) : 100

    // Render the preview
    const preview = await ReportDefinitionService.renderPreview(
      id,
      user.organizationId,
      { limit: Math.min(limit, 1000) }  // Cap at 1000 rows
    )

    return NextResponse.json(preview)
  } catch (error: any) {
    console.error("Error rendering preview:", error)
    
    if (error.message === "Report definition not found") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to render preview" },
      { status: 500 }
    )
  }
}
