/**
 * App Rows API
 * 
 * GET /api/task-lineages/[id]/app-rows - List all app rows for a lineage
 * POST /api/task-lineages/[id]/app-rows - Create a new app row
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Valid row types
const VALID_ROW_TYPES = ["text", "formula"]

/**
 * GET /api/task-lineages/[id]/app-rows
 * List all app rows for a lineage, ordered by position
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId } = await params
    const { organizationId } = session.user

    // Verify lineage exists and belongs to org
    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId },
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    // Get all rows ordered by position
    const rows = await prisma.appRowDefinition.findMany({
      where: { lineageId, organizationId },
      orderBy: { position: "asc" },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        values: true,
      },
    })

    return NextResponse.json({ rows })
  } catch (error: unknown) {
    console.error("Error listing app rows:", error)
    const message = error instanceof Error ? error.message : "Failed to list rows"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/task-lineages/[id]/app-rows
 * Create a new app row
 * 
 * Body:
 * - label: string (display name, e.g., "Total", "Notes")
 * - rowType: "text" | "formula"
 * - formula?: object (for formula rows: { expression: string, references: string[] })
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId } = await params
    const { organizationId } = session.user
    const userId = session.user.id
    const body = await request.json()

    const { label, rowType, formula } = body as {
      label: string
      rowType: string
      formula?: Record<string, unknown>
    }

    // Validate required fields
    if (!label?.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 })
    }

    if (!rowType || !VALID_ROW_TYPES.includes(rowType)) {
      return NextResponse.json(
        { error: `Invalid row type. Must be one of: ${VALID_ROW_TYPES.join(", ")}` },
        { status: 400 }
      )
    }

    // Verify lineage exists and belongs to org
    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId },
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    // Get the highest position for this lineage
    const maxPosition = await prisma.appRowDefinition.aggregate({
      where: { lineageId },
      _max: { position: true },
    })
    const nextPosition = (maxPosition._max.position ?? -1) + 1

    // Create the row
    const row = await prisma.appRowDefinition.create({
      data: {
        organizationId,
        lineageId,
        rowType,
        label: label.trim(),
        position: nextPosition,
        formula: formula ?? null,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        values: true,
      },
    })

    return NextResponse.json({ row }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error creating app row:", error)
    const message = error instanceof Error ? error.message : "Failed to create row"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
