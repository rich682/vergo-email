/**
 * App Columns API
 * 
 * GET /api/task-lineages/[id]/app-columns - List all app columns for a lineage
 * POST /api/task-lineages/[id]/app-columns - Create a new app column
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Valid column types
const VALID_DATA_TYPES = ["text", "status", "attachment", "user"]

// Default status options for new status columns
const DEFAULT_STATUS_OPTIONS = [
  { key: "todo", label: "To Do", color: "#6B7280" },
  { key: "in_progress", label: "In Progress", color: "#F59E0B" },
  { key: "done", label: "Done", color: "#10B981" },
]

/**
 * GET /api/task-lineages/[id]/app-columns
 * List all app columns for a lineage, ordered by position
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

    // Get all columns ordered by position
    const columns = await prisma.appColumnDefinition.findMany({
      where: { lineageId, organizationId },
      orderBy: { position: "asc" },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json({ columns })
  } catch (error: unknown) {
    console.error("Error listing app columns:", error)
    const message = error instanceof Error ? error.message : "Failed to list columns"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/task-lineages/[id]/app-columns
 * Create a new app column
 * 
 * Body:
 * - label: string (display name)
 * - dataType: "text" | "status" | "attachment" | "user"
 * - config?: object (for status: { options: [{key, label, color}] })
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

    const { label, dataType, config } = body as {
      label: string
      dataType: string
      config?: Record<string, unknown>
    }

    // Validate required fields
    if (!label?.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 })
    }

    if (!dataType || !VALID_DATA_TYPES.includes(dataType)) {
      return NextResponse.json(
        { error: `Invalid data type. Must be one of: ${VALID_DATA_TYPES.join(", ")}` },
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
    const maxPosition = await prisma.appColumnDefinition.aggregate({
      where: { lineageId },
      _max: { position: true },
    })
    const nextPosition = (maxPosition._max.position ?? -1) + 1

    // Generate a unique key based on type and position
    const key = `${dataType}_${Date.now()}`

    // Set default config for status columns
    let columnConfig = config
    if (dataType === "status" && !config) {
      columnConfig = { options: DEFAULT_STATUS_OPTIONS }
    }

    // Create the column
    const column = await prisma.appColumnDefinition.create({
      data: {
        organizationId,
        lineageId,
        key,
        label: label.trim(),
        dataType,
        config: columnConfig ?? null,
        position: nextPosition,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json({ column }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error creating app column:", error)
    const message = error instanceof Error ? error.message : "Failed to create column"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
