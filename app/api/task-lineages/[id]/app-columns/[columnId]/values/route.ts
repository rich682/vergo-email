/**
 * App Column Values API
 * 
 * GET /api/task-lineages/[id]/app-columns/[columnId]/values - Get all values for a column
 * POST /api/task-lineages/[id]/app-columns/[columnId]/values - Bulk upsert values
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/task-lineages/[id]/app-columns/[columnId]/values
 * Get all values for a column
 * 
 * Query params:
 * - identities: comma-separated list of row identities to filter (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, columnId } = await params
    const { organizationId } = session.user
    const { searchParams } = new URL(request.url)
    const identitiesParam = searchParams.get("identities")

    // Verify column exists
    const column = await prisma.appColumnDefinition.findFirst({
      where: { id: columnId, lineageId, organizationId },
    })

    if (!column) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 })
    }

    // Build where clause
    const where: Record<string, unknown> = {
      columnId,
      organizationId,
    }

    if (identitiesParam) {
      const identities = identitiesParam.split(",").map((i) => i.trim()).filter(Boolean)
      if (identities.length > 0) {
        where.rowIdentity = { in: identities }
      }
    }

    // Get values
    const values = await prisma.appColumnValue.findMany({
      where,
      include: {
        updatedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    // Transform to a map for easier consumption
    const valueMap: Record<string, unknown> = {}
    for (const v of values) {
      valueMap[v.rowIdentity] = {
        id: v.id,
        value: v.value,
        updatedAt: v.updatedAt,
        updatedBy: v.updatedBy,
      }
    }

    return NextResponse.json({ values: valueMap, column })
  } catch (error: unknown) {
    console.error("Error getting column values:", error)
    const message = error instanceof Error ? error.message : "Failed to get values"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/task-lineages/[id]/app-columns/[columnId]/values
 * Bulk upsert values for a column
 * 
 * Body:
 * - values: { [rowIdentity: string]: any } - map of row identity to value
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId, columnId } = await params
    const { organizationId } = session.user
    const userId = session.user.id
    const body = await request.json()

    const { values } = body as {
      values: Record<string, unknown>
    }

    if (!values || typeof values !== "object") {
      return NextResponse.json({ error: "Values object is required" }, { status: 400 })
    }

    // Verify column exists
    const column = await prisma.appColumnDefinition.findFirst({
      where: { id: columnId, lineageId, organizationId },
    })

    if (!column) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 })
    }

    // Validate values based on column type
    const entries = Object.entries(values)
    for (const [rowIdentity, value] of entries) {
      if (!rowIdentity.trim()) {
        return NextResponse.json({ error: "Row identity cannot be empty" }, { status: 400 })
      }

      // Type-specific validation
      if (column.dataType === "status") {
        const statusValue = value as { statusKey?: string }
        if (statusValue && statusValue.statusKey) {
          const config = column.config as { options?: Array<{ key: string }> }
          const validKeys = config?.options?.map((o) => o.key) || []
          if (!validKeys.includes(statusValue.statusKey)) {
            return NextResponse.json(
              { error: `Invalid status key: ${statusValue.statusKey}` },
              { status: 400 }
            )
          }
        }
      }
    }

    // Perform bulk upsert
    const results = await prisma.$transaction(
      entries.map(([rowIdentity, value]) =>
        prisma.appColumnValue.upsert({
          where: {
            columnId_rowIdentity: { columnId, rowIdentity },
          },
          update: {
            value: value as any,
            updatedById: userId,
          },
          create: {
            organizationId,
            columnId,
            rowIdentity,
            value: value as any,
            updatedById: userId,
          },
        })
      )
    )

    return NextResponse.json({
      success: true,
      updated: results.length,
    })
  } catch (error: unknown) {
    console.error("Error upserting column values:", error)
    const message = error instanceof Error ? error.message : "Failed to update values"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
