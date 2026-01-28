/**
 * Database Import Preview API
 * 
 * POST /api/databases/[id]/import/preview - Validate import data without persisting
 * Returns info about which rows are new vs duplicates
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseService, DatabaseSchema, validateRows, validateRowsAgainstExisting, MAX_ROWS } from "@/lib/services/database.service"
import { parseExcelWithSchema } from "@/lib/utils/excel-utils"

interface RouteParams {
  params: { id: string }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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

    // Get the database
    const database = await prisma.database.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
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

    const schema = database.schema as DatabaseSchema
    const identifierKeys = database.identifierKeys as string[]
    const existingRows = database.rows as Record<string, any>[]

    // Parse the uploaded file
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    
    try {
      const rows = parseExcelWithSchema(Buffer.from(buffer), schema)

      // Check for missing columns (warnings)
      const warnings: string[] = []
      const rowKeys = rows.length > 0 ? new Set(Object.keys(rows[0])) : new Set()
      
      for (const col of schema.columns) {
        if (!rowKeys.has(col.key) && col.required) {
          warnings.push(`Required column "${col.label}" not found in file`)
        }
      }

      // Validate rows within import batch
      const validation = validateRows(rows, schema, identifierKeys)

      // Check against existing data
      const { newRows, duplicateRows, duplicateKeys } = validateRowsAgainstExisting(
        rows,
        existingRows,
        identifierKeys
      )

      // Check row limit
      const totalAfterImport = existingRows.length + newRows.length
      const wouldExceedLimit = totalAfterImport > MAX_ROWS

      // Collect all errors
      const errors = [...validation.errors]
      
      if (wouldExceedLimit) {
        errors.push(
          `Adding ${newRows.length} rows would exceed the ${MAX_ROWS.toLocaleString()} row limit ` +
          `(current: ${existingRows.length})`
        )
      }

      // Add duplicate info to warnings
      if (duplicateRows.length > 0) {
        const maxToShow = 5
        warnings.push(`${duplicateRows.length} duplicate row(s) will be rejected:`)
        for (let i = 0; i < Math.min(duplicateKeys.length, maxToShow); i++) {
          warnings.push(`  • ${duplicateKeys[i]}`)
        }
        if (duplicateKeys.length > maxToShow) {
          warnings.push(`  • ...and ${duplicateKeys.length - maxToShow} more`)
        }
      }

      // Determine validity: valid if no validation errors, no row limit issues, and no duplicates
      const valid = validation.valid && !wouldExceedLimit && duplicateRows.length === 0

      return NextResponse.json({
        valid,
        errors: errors.slice(0, 50), // Limit error messages
        warnings,
        rowCount: rows.length,
        newRowCount: newRows.length,
        duplicateCount: duplicateRows.length,
        existingRowCount: database.rowCount,
        totalAfterImport: valid ? existingRows.length + newRows.length : existingRows.length,
        sampleRows: newRows.slice(0, 5), // Return sample of new rows for preview
      })
    } catch (parseError: any) {
      return NextResponse.json({
        valid: false,
        errors: [parseError.message || "Failed to parse Excel file"],
        warnings: [],
        rowCount: 0,
        newRowCount: 0,
        duplicateCount: 0,
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
