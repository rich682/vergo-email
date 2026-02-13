/**
 * Database Export API
 * 
 * GET /api/databases/[id]/export.xlsx - Export database data to Excel
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseService, DatabaseSchema, DatabaseRow } from "@/lib/services/database.service"
import { exportToExcel } from "@/lib/utils/excel-utils"
import { canPerformAction } from "@/lib/permissions"

export const maxDuration = 45;
interface RouteParams {
  params: { id: string }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    if (!canPerformAction(session.user.role, "databases:view", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to view databases" }, { status: 403 })
    }

    // Get the database with all data
    const database = await prisma.database.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
      },
      select: {
        name: true,
        schema: true,
        rows: true,
      },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    // Non-admin must be a viewer
    const isAdmin = session.user.role === "ADMIN"
    if (!isAdmin) {
      const isViewer = await DatabaseService.isViewer(params.id, session.user.id)
      if (!isViewer) {
        return NextResponse.json(
          { error: "You do not have viewer access to this database" },
          { status: 403 }
        )
      }
    }

    const schema = database.schema as unknown as DatabaseSchema
    const rows = database.rows as unknown as DatabaseRow[]

    // Generate the Excel file
    const buffer = exportToExcel(schema, rows, database.name)

    // Generate filename with timestamp
    const safeName = database.name.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)
    const timestamp = new Date().toISOString().split("T")[0]
    const filename = `${safeName}_export_${timestamp}.xlsx`

    // Return as downloadable file
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("Error exporting database:", error)
    return NextResponse.json(
      { error: "Failed to export database" },
      { status: 500 }
    )
  }
}
