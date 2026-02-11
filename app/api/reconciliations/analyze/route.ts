/**
 * POST /api/reconciliations/analyze
 * Parse a file and return detected columns + sample data without requiring a config.
 * Used in the AI-native setup flow: upload first, then configure.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ReconciliationFileParserService } from "@/lib/services/reconciliation-file-parser.service"
import { canPerformAction } from "@/lib/permissions"

// Allow up to 60s for PDF AI extraction
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "reconciliations:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage reconciliations" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })
    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
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

    // Parse without any column config -- pure auto-detection
    const parseResult = await ReconciliationFileParserService.parseFile(
      buffer,
      file.name,
      undefined // no source config -- auto-detect everything
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
        warnings: [
          "Could not detect tabular data in this file.",
          "For PDFs, ensure the document contains a clear data table (e.g. transactions list).",
          "Alternatively, try exporting the data as CSV or Excel for best results.",
        ],
      })
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      rowCount: parseResult.rowCount,
      columns,
      warnings: parseResult.warnings,
    })
  } catch (error: any) {
    console.error("[Reconciliations] Error analyzing file:", error)
    return NextResponse.json(
      { error: "Failed to analyze file" },
      { status: 500 }
    )
  }
}
