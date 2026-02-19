/**
 * Database Rows API
 *
 * GET    /api/databases/[id]/rows?limit=N - Get sample rows (default 3)
 * DELETE /api/databases/[id]/rows - Delete specific rows from a database
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { DatabaseRow } from "@/lib/services/database.service"

interface RouteParams {
  params: { id: string }
}

// GET - Get sample rows from a database
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

    if (!canPerformAction(session.user.role, "databases:view_databases", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "3", 10) || 3,
      10
    )

    const database = await prisma.database.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      select: { rows: true, schema: true },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const allRows = (database.rows as Record<string, unknown>[]) || []
    const sampleRows = allRows.slice(0, limit)

    return NextResponse.json({ sampleRows })
  } catch (error) {
    console.error("Error fetching sample rows:", error)
    return NextResponse.json(
      { error: "Failed to fetch sample rows" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    if (!canPerformAction(session.user.role, "databases:manage", session.user.orgActionPermissions)) {
      return NextResponse.json(
        { error: "You do not have permission to manage databases" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { rowIndices } = body as { rowIndices: number[] }

    if (!rowIndices || !Array.isArray(rowIndices) || rowIndices.length === 0) {
      return NextResponse.json(
        { error: "rowIndices must be a non-empty array of row indices" },
        { status: 400 }
      )
    }

    const database = await prisma.database.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const existingRows = database.rows as unknown as DatabaseRow[]
    const indicesToDelete = new Set(rowIndices)

    // Filter out the rows at the specified indices
    const remainingRows = existingRows.filter((_, index) => !indicesToDelete.has(index))
    const deletedCount = existingRows.length - remainingRows.length

    if (deletedCount === 0) {
      return NextResponse.json({ deleted: 0 })
    }

    await prisma.database.update({
      where: { id: params.id },
      data: {
        rows: remainingRows as any,
        rowCount: remainingRows.length,
      },
    })

    return NextResponse.json({ deleted: deletedCount, newRowCount: remainingRows.length })
  } catch (error) {
    console.error("Error deleting rows:", error)
    return NextResponse.json(
      { error: "Failed to delete rows" },
      { status: 500 }
    )
  }
}
