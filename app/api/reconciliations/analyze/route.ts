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

export async function POST(request: NextRequest) {
  try {
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

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
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
      { error: error.message || "Failed to analyze file" },
      { status: 500 }
    )
  }
}
