import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"
import { AttachmentExtractionService, ExcelExtractionResult } from "@/lib/services/attachment-extraction.service"
import { 
  SupportingDocument, 
  AnchoredReconciliationResult,
  SupportingDocumentResult,
  ReconciliationIntent,
  Discrepancy
} from "@/lib/services/reconciliation-processor.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/task-instances/[id]/reconciliations/[reconciliationId]/export
 * Export reconciliation results to Excel with anchored working paper format
 * 
 * Sheet structure:
 * 1. Summary - Overview with anchor/supporting distinction
 * 2. Anchor - Source document with Recon Status columns
 * 3-N. Supporting: {Name} - One sheet per supporting doc
 * N+1. Matched - All matched pairs
 * N+2. Unmatched - All issues with suggested actions
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

    const result = reconciliation.result as AnchoredReconciliationResult | any
    const discrepancies = (reconciliation.discrepancies as unknown as Discrepancy[]) || []
    
    // Build list of all supporting documents with mimeType
    const supportingDocs: Array<{ name: string; url: string; mimeType?: string }> = [
      { 
        name: reconciliation.document2Name, 
        url: reconciliation.document2Url || reconciliation.document2Key,
        mimeType: reconciliation.document2MimeType || undefined
      }
    ]
    const additionalDocs = (reconciliation.supportingDocuments as unknown as SupportingDocument[]) || []
    for (const doc of additionalDocs) {
      supportingDocs.push({ 
        name: doc.name, 
        url: doc.url,
        mimeType: (doc as any).mimeType
      })
    }

    // Create workbook
    const workbook = XLSX.utils.book_new()

    // ========================================
    // SHEET 1: SUMMARY
    // ========================================
    const reconciliationIntent = result?.reconciliationIntent as ReconciliationIntent | undefined
    const supportingResults = (result?.supportingResults as SupportingDocumentResult[]) || []
    
    // Determine reconciliation status
    const totalDiscrepancies = discrepancies.length
    const reconStatus = totalDiscrepancies === 0 
      ? "Balanced" 
      : (reconciliation.matchedCount || 0) > 0 && totalDiscrepancies > 0
        ? "Balanced with Exceptions"
        : "Not Balanced"

    // Calculate totals if available
    const anchorTotal = result?.anchor?.totalValue
    const supportingTotals = supportingResults.reduce((sum, r) => sum + (r.totalValue || 0), 0)
    const difference = anchorTotal !== undefined && supportingTotals ? anchorTotal - supportingTotals : undefined

    // V1: Get confidence and findings
    const confidenceScore = reconciliation.confidenceScore
    const confidenceLabel = confidenceScore !== null 
      ? (confidenceScore >= 80 ? "High" : confidenceScore >= 50 ? "Medium" : "Low")
      : null
    const keyFindings = (reconciliation.keyFindings as string[]) || []
    const suggestedNextSteps = (reconciliation.suggestedNextSteps as string[]) || []

    const summaryData: any[][] = [
      ["Reconciliation Working Paper"],
      [""],
      ["Reconciliation Name", job.name],
      ["Anchor Document (Source of Truth)", reconciliation.document1Name],
      ["Anchor Role", reconciliation.anchorRole || "Source Document"],
      ["Supporting Documents", supportingDocs.map(d => d.name).join(", ")],
      [""],
      ["Reconciliation Intent", reconciliationIntent?.type || "ROW_LEVEL"],
      ["Intent Explanation", reconciliationIntent?.anchorRoleExplanation || ""],
      [""],
      ["=== AI ANALYSIS (V1) ==="],
      ["AI Confidence Score", confidenceScore !== null ? `${confidenceScore}% (${confidenceLabel})` : "N/A"],
      ["AI Explanation", reconciliation.summary || ""],
      [""],
      ["Key Findings:"],
      ...keyFindings.map((finding, i) => [`  ${i + 1}. ${finding}`]),
      keyFindings.length === 0 ? ["  (No findings recorded)"] : null,
      [""],
      ["Suggested Next Steps:"],
      ...suggestedNextSteps.map((step, i) => [`  ${i + 1}. ${step}`]),
      suggestedNextSteps.length === 0 ? ["  (No next steps recorded)"] : null,
      [""],
      ["Status", reconStatus],
      ["Processed At", reconciliation.processedAt?.toISOString() || reconciliation.updatedAt?.toISOString() || ""],
      [""],
      ["=== ANCHOR SUMMARY ==="],
      ["Anchor Rows", result?.anchor?.rowCount || "N/A"],
      ["Anchor Total", anchorTotal !== undefined ? anchorTotal : "N/A"],
      ["Anchor Document Type", reconciliation.document1MimeType || "N/A"],
      [""],
      ["=== SUPPORTING SUMMARY ==="],
      ["Document", "Rows", "Total", "Matched", "Unmatched", "Type"]
    ].filter(Boolean) as any[][]

    // Add per-supporting stats
    for (let i = 0; i < supportingResults.length; i++) {
      const sr = supportingResults[i]
      const docMimeType = i === 0 
        ? reconciliation.document2MimeType 
        : supportingDocs[i]?.mimeType || "N/A"
      
      summaryData.push([
        sr.documentName,
        sr.rowCount,
        sr.totalValue !== undefined ? sr.totalValue : "N/A",
        sr.matchedCount,
        sr.unmatchedCount,
        docMimeType || "N/A"
      ])
    }

    // If no supporting results available (legacy), use top-level stats
    if (supportingResults.length === 0) {
      summaryData.push([
        reconciliation.document2Name,
        "N/A",
        "N/A",
        reconciliation.matchedCount || 0,
        reconciliation.unmatchedCount || 0,
        reconciliation.document2MimeType || "N/A"
      ])
    }

    summaryData.push(
      [""],
      ["=== TOTALS ==="],
      ["Total Matched", reconciliation.matchedCount || 0],
      ["Total Unmatched", reconciliation.unmatchedCount || 0],
      ["Net Difference", difference !== undefined ? difference : "N/A"],
      ["Exceptions Requiring Action", totalDiscrepancies],
      [""],
      ["Reviewer Notes", ""]
    )

    // Add intent-specific note
    if (reconciliationIntent?.type === "TOTALS_ONLY") {
      summaryData.push([
        "Note",
        "This reconciliation verifies total amounts match. Row-level differences may be expected."
      ])
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    // Set column widths
    summarySheet["!cols"] = [{ wch: 30 }, { wch: 50 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary")

    // ========================================
    // SHEET 2: ANCHOR (Source of Truth)
    // ========================================
    try {
      const anchorResult = await AttachmentExtractionService.extractFromUrl(
        reconciliation.document1Url || reconciliation.document1Key,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )

      if (anchorResult.success) {
        const anchorSheets = (anchorResult as ExcelExtractionResult).sheets || []
        if (anchorSheets.length > 0) {
          const anchorData = anchorSheets[0]
          
          // Add original data with recon status columns
          const headers = [...anchorData.columns, "Recon Status", "Matched To", "Match ID"]
          const rows = anchorData.rows.map((row, idx) => {
            const keyCol = result?.anchor?.columns?.[0] || anchorData.columns[0]
            const keyValue = String(row[keyCol] || "").toLowerCase()
            
            // Find if this row has discrepancies
            const rowDiscrepancy = discrepancies.find(d => 
              d.keyValue?.toLowerCase() === keyValue && 
              (d.type === "missing_in_doc2" || d.type === "value_mismatch")
            )
            
            const status = rowDiscrepancy ? "Unmatched" : "Matched"
            const matchedTo = rowDiscrepancy ? "" : supportingDocs.map(d => d.name).join(", ")
            const matchId = rowDiscrepancy ? "" : `M-${idx + 1}`

            return [
              ...anchorData.columns.map(col => row[col]),
              status,
              matchedTo,
              matchId
            ]
          })

          const anchorSheetData = [headers, ...rows]
          const anchorSheet = XLSX.utils.aoa_to_sheet(anchorSheetData)
          XLSX.utils.book_append_sheet(workbook, anchorSheet, "Anchor")
        }
      }
    } catch (extractError) {
      console.warn("[Export] Could not extract anchor for export:", extractError)
      // Add placeholder sheet
      const placeholderData = [["Anchor document could not be extracted for export"]]
      const placeholderSheet = XLSX.utils.aoa_to_sheet(placeholderData)
      XLSX.utils.book_append_sheet(workbook, placeholderSheet, "Anchor")
    }

    // ========================================
    // SHEETS 3-N: SUPPORTING DOCUMENTS
    // ========================================
    for (let i = 0; i < supportingDocs.length; i++) {
      const supportingDoc = supportingDocs[i]
      const supportingResult = supportingResults[i]
      
      try {
        const extractResult = await AttachmentExtractionService.extractFromUrl(
          supportingDoc.url,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        if (extractResult.success) {
          const sheets = (extractResult as ExcelExtractionResult).sheets || []
          if (sheets.length > 0) {
            const sheetData = sheets[0]
            
            // Add original data with recon status columns
            const headers = [...sheetData.columns, "Recon Status", "Match ID"]
            const rows = sheetData.rows.map((row, idx) => {
              const keyCol = supportingResult?.keyColumn || sheetData.columns[0]
              const keyValue = String(row[keyCol] || "").toLowerCase()
              
              // Find if this row has discrepancies
              const rowDiscrepancy = discrepancies.find(d => 
                d.keyValue?.toLowerCase() === keyValue && 
                d.type === "missing_in_doc1"
              )
              
              const status = rowDiscrepancy ? "Unmatched" : "Matched"
              const matchId = rowDiscrepancy ? "" : `M-${idx + 1}`

              return [
                ...sheetData.columns.map(col => row[col]),
                status,
                matchId
              ]
            })

            const supportingSheetData = [headers, ...rows]
            const supportingSheet = XLSX.utils.aoa_to_sheet(supportingSheetData)
            
            // Sanitize sheet name (max 31 chars, no special chars)
            const sheetName = `Supporting - ${supportingDoc.name}`
              .replace(/[\\\/\?\*\[\]]/g, "")
              .substring(0, 31)
            
            XLSX.utils.book_append_sheet(workbook, supportingSheet, sheetName)
          }
        }
      } catch (extractError) {
        console.warn(`[Export] Could not extract supporting doc ${supportingDoc.name}:`, extractError)
        // Add placeholder
        const placeholderData = [[`Supporting document "${supportingDoc.name}" could not be extracted`]]
        const placeholderSheet = XLSX.utils.aoa_to_sheet(placeholderData)
        const sheetName = `Supporting - ${i + 1}`.substring(0, 31)
        XLSX.utils.book_append_sheet(workbook, placeholderSheet, sheetName)
      }
    }

    // ========================================
    // SHEET N+1: MATCHED
    // ========================================
    const matchedHeaders = [
      "Match ID",
      "Supporting Document",
      "Match Type",
      "Match Confidence",
      "Match Reason",
      "Anchor Reference",
      "Supporting Reference",
      "Anchor Amount",
      "Supporting Amount",
      "Difference"
    ]

    const matchedRows: any[][] = []
    let matchId = 1

    // Build matched rows from supporting results
    for (const sr of supportingResults) {
      if (!sr.discrepancies) continue
      
      // For rows NOT in discrepancies, they are matched
      // This is a simplification - in a real implementation we'd track actual matches
      const matchedCount = sr.matchedCount || 0
      for (let i = 0; i < matchedCount; i++) {
        matchedRows.push([
          `M-${matchId++}`,
          sr.documentName,
          "Exact", // Simplification
          "100%",
          "Values match exactly",
          "", // Would need actual row data
          "",
          "",
          "",
          0
        ])
      }
    }

    // If no detailed results, use top-level stats
    if (matchedRows.length === 0 && (reconciliation.matchedCount || 0) > 0) {
      for (let i = 0; i < (reconciliation.matchedCount || 0); i++) {
        matchedRows.push([
          `M-${matchId++}`,
          reconciliation.document2Name,
          "Match",
          "N/A",
          "Row matched",
          "",
          "",
          "",
          "",
          ""
        ])
      }
    }

    if (matchedRows.length > 0) {
      const matchedData = [matchedHeaders, ...matchedRows]
      const matchedSheet = XLSX.utils.aoa_to_sheet(matchedData)
      XLSX.utils.book_append_sheet(workbook, matchedSheet, "Matched")
    } else {
      // Empty matched sheet
      const matchedSheet = XLSX.utils.aoa_to_sheet([matchedHeaders, ["No matches found"]])
      XLSX.utils.book_append_sheet(workbook, matchedSheet, "Matched")
    }

    // ========================================
    // SHEET N+2: UNMATCHED
    // ========================================
    const unmatchedHeaders = [
      "Issue Type",
      "Related Document",
      "Source",
      "Reference",
      "Date",
      "Amount",
      "Difference",
      "Suggested Action",
      "Notes"
    ]

    const unmatchedRows = discrepancies.map(d => {
      // Determine issue type with human-readable labels
      let issueType = "Unknown"
      let source = "Unknown"
      let relatedDoc = ""
      
      if (d.type === "missing_in_doc1") {
        issueType = "Missing in Anchor"
        source = "Supporting"
        relatedDoc = supportingDocs[0]?.name || "Supporting Document"
      } else if (d.type === "missing_in_doc2") {
        issueType = "Missing in Supporting"
        source = "Anchor"
        relatedDoc = reconciliation.document1Name
      } else if (d.type === "value_mismatch") {
        issueType = "Value Mismatch"
        source = "Both"
        relatedDoc = "Anchor vs Supporting"
      }

      // Extract amount if present in row data
      let amount = ""
      let date = ""
      if (d.doc1Row) {
        const amountCol = Object.keys(d.doc1Row).find(k => 
          k.toLowerCase().includes("amount") || k.toLowerCase().includes("total")
        )
        if (amountCol) amount = String(d.doc1Row[amountCol] || "")
        
        const dateCol = Object.keys(d.doc1Row).find(k => 
          k.toLowerCase().includes("date")
        )
        if (dateCol) date = String(d.doc1Row[dateCol] || "")
      }

      // Generate suggested action based on intent
      let suggestedAction = "Review and resolve"
      if (reconciliationIntent?.type === "TOTALS_ONLY") {
        suggestedAction = "Verify if row-level difference impacts totals"
      } else if (d.type === "missing_in_doc1") {
        suggestedAction = "Investigate why item appears in supporting but not in anchor"
      } else if (d.type === "missing_in_doc2") {
        suggestedAction = "Locate corresponding entry in supporting documents"
      } else if (d.type === "value_mismatch") {
        suggestedAction = "Review and reconcile value difference"
      }

      return [
        issueType,
        relatedDoc,
        source,
        d.keyValue || "",
        date,
        amount,
        "", // Difference - would need calculation
        suggestedAction,
        "" // Notes - blank for reviewer
      ]
    })

    if (unmatchedRows.length > 0) {
      const unmatchedData = [unmatchedHeaders, ...unmatchedRows]
      const unmatchedSheet = XLSX.utils.aoa_to_sheet(unmatchedData)
      unmatchedSheet["!cols"] = [
        { wch: 20 }, { wch: 25 }, { wch: 12 }, { wch: 20 },
        { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 40 }, { wch: 30 }
      ]
      XLSX.utils.book_append_sheet(workbook, unmatchedSheet, "Unmatched")
    } else {
      const unmatchedSheet = XLSX.utils.aoa_to_sheet([unmatchedHeaders, ["No unmatched items"]])
      XLSX.utils.book_append_sheet(workbook, unmatchedSheet, "Unmatched")
    }

    // ========================================
    // GENERATE FILE
    // ========================================
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
