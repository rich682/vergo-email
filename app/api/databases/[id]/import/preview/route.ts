/**
 * Database Import Preview API
 * 
 * POST /api/databases/[id]/import/preview - Validate import data without persisting
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseSchema, validateRows, MAX_ROWS } from "@/lib/services/database.service"
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
        identifierKey: true,
        rowCount: true,
      },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const schema = database.schema as DatabaseSchema

    // Parse the uploaded file
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    
    try {
      const rows = parseExcelWithSchema(Buffer.from(buffer), schema)

      // Check row limit
      if (rows.length > MAX_ROWS) {
        return NextResponse.json({
          valid: false,
          errors: [`File contains ${rows.length.toLocaleString()} rows, which exceeds the limit of ${MAX_ROWS.toLocaleString()}`],
          rowCount: rows.length,
          existingRowCount: database.rowCount,
        })
      }

      // Validate rows
      const validation = validateRows(rows, schema, database.identifierKey)

      // Check for missing columns (warnings)
      const warnings: string[] = []
      const schemaColumns = new Set(schema.columns.map(c => c.key))
      const rowKeys = rows.length > 0 ? new Set(Object.keys(rows[0])) : new Set()
      
      for (const col of schema.columns) {
        if (!rowKeys.has(col.key) && col.required) {
          warnings.push(`Required column "${col.label}" not found in file`)
        }
      }

      return NextResponse.json({
        valid: validation.valid && warnings.length === 0,
        errors: validation.errors.slice(0, 50), // Limit error messages
        warnings,
        rowCount: rows.length,
        existingRowCount: database.rowCount,
        sampleRows: rows.slice(0, 5), // Return sample for preview
      })
    } catch (parseError: any) {
      return NextResponse.json({
        valid: false,
        errors: [parseError.message || "Failed to parse Excel file"],
        rowCount: 0,
        existingRowCount: database.rowCount,
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
