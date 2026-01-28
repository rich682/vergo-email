/**
 * Database Import API
 * 
 * POST /api/databases/[id]/import - Confirm and execute import (append-only)
 * Adds new rows only, rejects duplicates based on composite identifier keys
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseService, DatabaseSchema } from "@/lib/services/database.service"
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
      select: { id: true, organizationId: true },
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
        id: true,
        schema: true,
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

      // Import the rows (append-only: adds new rows, rejects duplicates)
      const result = await DatabaseService.importRows(
        params.id,
        user.organizationId,
        user.id,
        rows
      )

      if (result.errors.length > 0) {
        return NextResponse.json({
          success: false,
          added: result.added,
          duplicates: result.duplicates,
          errors: result.errors,
          message: result.errors[0],
        }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        added: result.added,
        duplicates: result.duplicates,
        errors: [],
        message: `Successfully added ${result.added.toLocaleString()} new row(s)`,
      })
    } catch (importError: any) {
      return NextResponse.json({
        success: false,
        added: 0,
        duplicates: 0,
        errors: [importError.message || "Failed to import data"],
        message: importError.message || "Failed to import data",
      }, { status: 400 })
    }
  } catch (error) {
    console.error("Error importing data:", error)
    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    )
  }
}
