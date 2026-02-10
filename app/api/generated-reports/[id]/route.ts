/**
 * Generated Reports API - Single Report Operations
 * 
 * GET /api/generated-reports/[id] - Get a single generated report with data
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportGenerationService } from "@/lib/services/report-generation.service"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get single generated report
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    const report = await ReportGenerationService.getById(id, user.organizationId)

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Access check: admins see all, non-admins must be an explicit viewer
    if (user.role !== "ADMIN") {
      const isViewer = await prisma.generatedReportViewer.findUnique({
        where: { generatedReportId_userId: { generatedReportId: id, userId: user.id } }
      })
      if (!isViewer) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    }

    return NextResponse.json({ report })
  } catch (error) {
    console.error("Error getting generated report:", error)
    return NextResponse.json(
      { error: "Failed to get generated report" },
      { status: 500 }
    )
  }
}
