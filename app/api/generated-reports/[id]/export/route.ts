/**
 * Generated Report Export API
 * 
 * GET /api/generated-reports/[id]/export - Export report to Excel
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReportGenerationService } from "@/lib/services/report-generation.service"
import { reportToExcel, generateExportFilename } from "@/lib/utils/excel-export"

export const maxDuration = 45;
interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Export report to Excel
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

    // Get the generated report
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

    // Convert to Excel
    const buffer = reportToExcel(report.data)
    
    // Generate filename
    const filename = generateExportFilename(
      report.data.reportName,
      report.data.sliceName,
      report.periodKey
    )

    // Return as downloadable file
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Error exporting report:", error)
    return NextResponse.json(
      { error: "Failed to export report" },
      { status: 500 }
    )
  }
}
