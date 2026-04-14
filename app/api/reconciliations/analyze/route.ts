/**
 * POST /api/reconciliations/analyze
 * Parse a file and return detected columns + sample data without requiring a config.
 * Used in the AI-native setup flow: upload first, then configure.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ReconciliationFileParserService } from "@/lib/services/reconciliation-file-parser.service"
import { canPerformAction } from "@/lib/permissions"
import type { ExtractionProfile } from "@/lib/services/reconciliation.service"

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage reconciliations" }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    // Validate file size (max 25MB)
    const MAX_FILE_SIZE = 25 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 25MB, got ${(file.size / 1024 / 1024).toFixed(1)}MB` },
        { status: 400 }
      )
    }

    // Validate file type
    const ALLOWED_TYPES = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/pdf",
    ]
    const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx", ".pdf"]
    const fileExtension = file.name ? `.${file.name.split(".").pop()?.toLowerCase()}` : ""
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return NextResponse.json(
        { error: "Invalid file type. Accepted formats: CSV, XLS, XLSX, PDF" },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Build extraction profile from optional form fields (used for retry-with-hints)
    const documentDescription = formData.get("documentDescription") as string | null
    const extractionHints = formData.get("extractionHints") as string | null
    let extractionProfile: ExtractionProfile | undefined
    if (documentDescription || extractionHints) {
      extractionProfile = {
        ...(documentDescription && { documentDescription }),
        ...(extractionHints && { extractionHints }),
      }
    }

    // For Excel/CSV: parse returns ALL rows (no AI needed, fast)
    // For PDF: use "detect" mode (fast — 5 sample rows + count)
    const isPdf = fileExtension === ".pdf"
    const parseResult = await ReconciliationFileParserService.parseFile(
      buffer,
      file.name,
      undefined, // no source config -- auto-detect everything
      isPdf ? "detect" : "full", // Excel/CSV: full parse is instant. PDF: detect only.
      extractionProfile
    )

    // AI-detect column types from the data
    const detectedTypes = ReconciliationFileParserService.detectColumnTypes(
      parseResult.detectedColumns
    )

    // Build rich column info with sample data and suggested types
    const columns = parseResult.detectedColumns.map((col) => {
      const typeInfo = detectedTypes.find((t) => t.key === col.key)
      return {
        key: col.key,
        label: col.label,
        sampleValues: col.sampleValues,
        suggestedType: typeInfo?.suggestedType || "text",
      }
    })

    // If no columns or rows found, provide a helpful error
    if (columns.length === 0 || parseResult.rowCount === 0) {
      return NextResponse.json({
        success: true,
        fileName: file.name,
        rowCount: 0,
        columns: [],
        rows: [],
        warnings: [
          "Could not detect tabular data in this file.",
          "For PDFs, ensure the document contains a clear data table (e.g. transactions list).",
          "Alternatively, try exporting the data as CSV or Excel for best results.",
        ],
      })
    }

    // For non-PDF files, include ALL parsed rows so generate-test doesn't need to re-parse
    // For PDFs, rows are placeholders from detect mode — will need full extraction later
    return NextResponse.json({
      success: true,
      fileName: file.name,
      rowCount: parseResult.rowCount,
      columns,
      warnings: parseResult.warnings,
      // Include full rows for Excel/CSV (they're already fully parsed)
      ...(!isPdf && { rows: parseResult.rows }),
    })
  } catch (error: any) {
    console.error("[Reconciliations] Error analyzing file:", error)
    const message = error?.message || "Failed to analyze file"
    return NextResponse.json(
      { error: message.includes("AI service") ? message : `Failed to analyze file: ${message}` },
      { status: 500 }
    )
  }
}
