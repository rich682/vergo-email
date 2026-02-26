/**
 * Database Import Preview API
 * 
 * POST /api/databases/[id]/import/preview - Validate import data without persisting
 * Returns info about which rows are new, exact duplicates, and update candidates
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseService, DatabaseSchema } from "@/lib/services/database.service"
import { parseExcelWithSchema } from "@/lib/utils/excel-utils"
import { checkRateLimit } from "@/lib/utils/rate-limit"

export const maxDuration = 60
interface RouteParams {
  params: { id: string }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { allowed } = await checkRateLimit(`upload:db-import:${session.user.id}`, 10)
    if (!allowed) {
      return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 })
    }

    // Get the database
    const database = await prisma.database.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId,
      },
      select: {
        name: true,
        schema: true,
        identifierKeys: true,
        rowCount: true,
        rows: true,
      },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const schema = database.schema as unknown as DatabaseSchema

    // Parse the uploaded file
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file size (max 25MB)
    const MAX_IMPORT_SIZE = 25 * 1024 * 1024
    if (file.size > MAX_IMPORT_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 25MB." },
        { status: 413 }
      )
    }

    const buffer = await file.arrayBuffer()
    
    try {
      const rows = parseExcelWithSchema(Buffer.from(buffer), schema)

      // Check for missing columns (warnings)
      const additionalWarnings: string[] = []
      const rowKeys = rows.length > 0 ? new Set(Object.keys(rows[0])) : new Set()
      
      for (const col of schema.columns) {
        if (!rowKeys.has(col.key) && col.required) {
          additionalWarnings.push(`Required column "${col.label}" not found in file`)
        }
      }

      // Use the service to preview import with full categorization
      const preview = await DatabaseService.previewImport(
        params.id,
        session.user.organizationId,
        rows
      )

      return NextResponse.json({
        valid: preview.valid,
        errors: preview.errors.slice(0, 50), // Limit error messages
        warnings: [...preview.warnings, ...additionalWarnings],
        rowCount: preview.rowCount,
        newRowCount: preview.newRowCount,
        exactDuplicateCount: preview.exactDuplicateCount,
        updateCandidates: preview.updateCandidates,
        existingRowCount: preview.existingRowCount,
        totalAfterImport: preview.totalAfterImport,
        identifierKeys: preview.identifierKeys,
        schema: preview.schema,
        sampleRows: [], // Removed for performance - full data available in updateCandidates
      })
    } catch (parseError: any) {
      return NextResponse.json({
        valid: false,
        errors: [parseError.message || "Failed to parse file"],
        warnings: [],
        rowCount: 0,
        newRowCount: 0,
        exactDuplicateCount: 0,
        updateCandidates: [],
        existingRowCount: database.rowCount,
        totalAfterImport: database.rowCount,
      })
    }
  } catch (error) {
    console.error("Error previewing import:", error)
    return NextResponse.json(
      { error: "Failed to preview import" },
      { status: 500 }
    )
  }
}
