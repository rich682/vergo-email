/**
 * Deleted Rows API
 *
 * GET    /api/databases/[id]/rows/deleted - List deleted row batches
 * POST   /api/databases/[id]/rows/deleted - Restore a batch of deleted rows
 * DELETE /api/databases/[id]/rows/deleted - Permanently purge a batch
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isAdmin } from "@/lib/permissions"
import { DatabaseRow } from "@/lib/services/database.service"

interface DeletedRowBatch {
  rows: DatabaseRow[]
  deletedAt: string
  deletedById: string
  deletedByName?: string
}

interface RouteParams {
  params: { id: string }
}

// GET - List deleted row batches for a database
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Only admins can view deleted rows" }, { status: 403 })
    }

    const database = await prisma.database.findFirst({
      where: { id: params.id, organizationId: session.user.organizationId },
      select: { id: true, name: true, deletedRows: true },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const batches = (database.deletedRows as unknown as DeletedRowBatch[]) || []

    return NextResponse.json({
      databaseId: database.id,
      databaseName: database.name,
      batches: batches.map((b, index) => ({
        batchIndex: index,
        rowCount: b.rows.length,
        deletedAt: b.deletedAt,
        deletedById: b.deletedById,
        deletedByName: b.deletedByName || null,
      })),
    })
  } catch (error) {
    console.error("Error fetching deleted rows:", error)
    return NextResponse.json({ error: "Failed to fetch deleted rows" }, { status: 500 })
  }
}

// POST - Restore a batch of deleted rows back into the database
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Only admins can restore deleted rows" }, { status: 403 })
    }

    const body = await request.json()
    const { batchIndex } = body as { batchIndex: number }

    if (typeof batchIndex !== "number" || batchIndex < 0) {
      return NextResponse.json({ error: "batchIndex is required" }, { status: 400 })
    }

    const database = await prisma.database.findFirst({
      where: { id: params.id, organizationId: session.user.organizationId },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const batches = (database.deletedRows as unknown as DeletedRowBatch[]) || []

    if (batchIndex >= batches.length) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    }

    const batch = batches[batchIndex]
    const currentRows = (database.rows as unknown as DatabaseRow[]) || []

    // Remove the batch from deletedRows and add its rows back
    const updatedBatches = batches.filter((_, i) => i !== batchIndex)

    await prisma.database.update({
      where: { id: params.id },
      data: {
        rows: [...currentRows, ...batch.rows] as unknown as Prisma.InputJsonValue,
        rowCount: currentRows.length + batch.rows.length,
        deletedRows: updatedBatches as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      restored: batch.rows.length,
      newRowCount: currentRows.length + batch.rows.length,
    })
  } catch (error) {
    console.error("Error restoring deleted rows:", error)
    return NextResponse.json({ error: "Failed to restore rows" }, { status: 500 })
  }
}

// DELETE - Permanently purge a batch of deleted rows
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Only admins can purge deleted rows" }, { status: 403 })
    }

    const body = await request.json()
    const { batchIndex } = body as { batchIndex: number }

    if (typeof batchIndex !== "number" || batchIndex < 0) {
      return NextResponse.json({ error: "batchIndex is required" }, { status: 400 })
    }

    const database = await prisma.database.findFirst({
      where: { id: params.id, organizationId: session.user.organizationId },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const batches = (database.deletedRows as unknown as DeletedRowBatch[]) || []

    if (batchIndex >= batches.length) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    }

    const purgedCount = batches[batchIndex].rows.length
    const updatedBatches = batches.filter((_, i) => i !== batchIndex)

    await prisma.database.update({
      where: { id: params.id },
      data: {
        deletedRows: updatedBatches as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({ purged: purgedCount })
  } catch (error) {
    console.error("Error purging deleted rows:", error)
    return NextResponse.json({ error: "Failed to purge rows" }, { status: 500 })
  }
}
