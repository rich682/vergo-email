/**
 * Database Import API
 * 
 * POST /api/databases/[id]/import - Confirm and execute import
 * - Exact duplicates (all columns match) are silently skipped
 * - Update candidates (identifier match, data differs) are updated if updateExisting=true
 * - New rows are added
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseService, DatabaseSchema } from "@/lib/services/database.service"
import { parseExcelWithSchema } from "@/lib/utils/excel-utils"
import { canWriteToModule } from "@/lib/permissions"

export const maxDuration = 60
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

    if (!canWriteToModule(session.user.role, "databases", session.user.orgRoleDefaults)) {
      return NextResponse.json({ error: "Read-only access" }, { status: 403 })
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

    const schema = database.schema as unknown as DatabaseSchema

    // Parse the uploaded file and options
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const updateExisting = formData.get("updateExisting") === "true"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
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
    ]
    const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"]
    const fileExtension = file.name ? `.${file.name.split(".").pop()?.toLowerCase()}` : ""
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return NextResponse.json(
        { error: "Invalid file type. Accepted formats: CSV, XLS, XLSX" },
        { status: 400 }
      )
    }

    const buffer = await file.arrayBuffer()
    
    try {
      const rows = parseExcelWithSchema(Buffer.from(buffer), schema)

      // Import the rows with optional update support
      const result = await DatabaseService.importRows(
        params.id,
        user.organizationId,
        user.id,
        rows,
        { updateExisting }
      )

      if (result.errors.length > 0) {
        return NextResponse.json({
          success: false,
          added: result.added,
          updated: result.updated,
          duplicates: result.duplicates,
          errors: result.errors,
          message: result.errors[0],
        }, { status: 400 })
      }

      // Build success message
      const messageParts: string[] = []
      if (result.added > 0) {
        messageParts.push(`${result.added.toLocaleString()} new row(s) added`)
      }
      if (result.updated > 0) {
        messageParts.push(`${result.updated.toLocaleString()} row(s) updated`)
      }
      if (result.duplicates > 0) {
        messageParts.push(`${result.duplicates.toLocaleString()} identical row(s) skipped`)
      }

      const message = messageParts.length > 0 
        ? `Successfully: ${messageParts.join(", ")}`
        : "No changes made"

      return NextResponse.json({
        success: true,
        added: result.added,
        updated: result.updated,
        duplicates: result.duplicates,
        errors: [],
        message,
      })
    } catch (importError: any) {
      console.error("Error parsing import file:", importError)
      return NextResponse.json({
        success: false,
        added: 0,
        updated: 0,
        duplicates: 0,
        errors: ["Failed to import data"],
        message: "Failed to import data",
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
