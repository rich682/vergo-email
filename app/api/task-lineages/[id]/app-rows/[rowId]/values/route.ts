/**
 * App Row Values API
 * 
 * GET /api/task-lineages/[id]/app-rows/[rowId]/values - Get all values for a row
 * POST /api/task-lineages/[id]/app-rows/[rowId]/values - Bulk upsert values
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/task-lineages/[id]/app-rows/[rowId]/values
 * Get all values for a row
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, rowId } = await params
    const { organizationId } = session.user

    // Verify row exists and belongs to org
    const row = await prisma.appRowDefinition.findFirst({
      where: { id: rowId, lineageId, organizationId },
    })

    if (!row) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 })
    }

    const values = await prisma.appRowValue.findMany({
      where: { rowId, organizationId },
    })

    return NextResponse.json({ values })
  } catch (error: unknown) {
    console.error("Error getting row values:", error)
    const message = error instanceof Error ? error.message : "Failed to get values"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/task-lineages/[id]/app-rows/[rowId]/values
 * Bulk upsert values for a row
 * 
 * Body:
 * - values: Array<{ columnKey: string, value: string | null }>
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, rowId } = await params
    const { organizationId } = session.user
    const userId = session.user.id
    const body = await request.json()

    const { values } = body as {
      values: Array<{ columnKey: string; value: string | null }>
    }

    if (!Array.isArray(values)) {
      return NextResponse.json({ error: "Values must be an array" }, { status: 400 })
    }

    // Verify row exists and belongs to org
    const row = await prisma.appRowDefinition.findFirst({
      where: { id: rowId, lineageId, organizationId },
    })

    if (!row) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 })
    }

    // Upsert each value
    const results = await Promise.all(
      values.map(({ columnKey, value }) =>
        prisma.appRowValue.upsert({
          where: {
            rowId_columnKey: { rowId, columnKey },
          },
          create: {
            organizationId,
            rowId,
            columnKey,
            value,
            updatedById: userId,
          },
          update: {
            value,
            updatedById: userId,
          },
        })
      )
    )

    return NextResponse.json({ values: results })
  } catch (error: unknown) {
    console.error("Error upserting row values:", error)
    const message = error instanceof Error ? error.message : "Failed to upsert values"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
