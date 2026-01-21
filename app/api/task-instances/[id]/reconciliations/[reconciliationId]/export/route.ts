import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

export const dynamic = "force-dynamic"

/**
 * GET /api/task-instances/[id]/reconciliations/[reconciliationId]/export
 * Export reconciliation results to Excel
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; reconciliationId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id
    const reconciliationId = params.reconciliationId

    // Verify job exists and belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId },
      select: { id: true, name: true }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Fetch reconciliation with results
    const reconciliation = await prisma.reconciliation.findFirst({
      where: {
        id: reconciliationId,
        taskInstanceId: jobId,
        organizationId
      }
    })

    if (!reconciliation) {
      return NextResponse.json({ error: "Reconciliation not found" }, { status: 404 })
    }

    if (reconciliation.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Reconciliation not yet completed" },
        { status: 400 }
      )
    }

    // Create workbook
    const workbook = XLSX.utils.book_new()

    // Summary sheet
    const summaryData = [
      ["Reconciliation Report"],
      [""],
      ["Document 1", reconciliation.document1Name],
      ["Document 2", reconciliation.document2Name],
      [""],
      ["Status", reconciliation.status],
      ["Processed At", reconciliation.updatedAt?.toISOString() || ""],
      [""],
      ["Summary"],
      [reconciliation.summary || "No summary available"],
      [""],
      ["Statistics"],
      ["Matched Rows", reconciliation.matchedCount || 0],
      ["Unmatched Rows", reconciliation.unmatchedCount || 0],
      ["Total Rows Analyzed", reconciliation.totalRows || 0],
      ["Match Rate", reconciliation.totalRows 
        ? `${((reconciliation.matchedCount || 0) / reconciliation.totalRows * 100).toFixed(1)}%` 
        : "N/A"
      ]
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary")

    // Discrepancies sheet
    const discrepancies = (reconciliation.discrepancies as any[]) || []
    if (discrepancies.length > 0) {
      const discrepancyHeaders = [
        "Type",
        "Key Column",
        "Key Value",
        "Details"
      ]
      
      const discrepancyRows = discrepancies.map(d => [
        d.type === "missing_in_doc1" ? "Missing in Doc 1" :
        d.type === "missing_in_doc2" ? "Missing in Doc 2" :
        "Value Mismatch",
        d.keyColumn || "",
        d.keyValue || "",
        d.details || ""
      ])

      const discrepancyData = [discrepancyHeaders, ...discrepancyRows]
      const discrepancySheet = XLSX.utils.aoa_to_sheet(discrepancyData)
      XLSX.utils.book_append_sheet(workbook, discrepancySheet, "Discrepancies")
    }

    // Column mappings sheet
    const result = reconciliation.result as any
    if (result?.columnMappings && result.columnMappings.length > 0) {
      const mappingHeaders = ["Document 1 Column", "Document 2 Column", "Match Type", "Confidence"]
      const mappingRows = result.columnMappings.map((m: any) => [
        m.doc1Column,
        m.doc2Column,
        m.matchType,
        `${(m.confidence * 100).toFixed(0)}%`
      ])
      
      const mappingData = [mappingHeaders, ...mappingRows]
      const mappingSheet = XLSX.utils.aoa_to_sheet(mappingData)
      XLSX.utils.book_append_sheet(workbook, mappingSheet, "Column Mappings")
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

    // Sanitize job name for filename
    const safeJobName = job.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50)
    const filename = `reconciliation-${safeJobName}-${Date.now()}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    })
  } catch (error: any) {
    console.error("[API/reconciliations/export] Error:", error)
    return NextResponse.json(
      { error: "Failed to export reconciliation", message: error.message },
      { status: 500 }
    )
  }
}
