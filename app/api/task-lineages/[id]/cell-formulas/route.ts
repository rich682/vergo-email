/**
 * Cell Formulas API
 *
 * GET /api/task-lineages/[id]/cell-formulas - List all cell formulas for a lineage
 * POST /api/task-lineages/[id]/cell-formulas - Create or update a cell formula
 * DELETE /api/task-lineages/[id]/cell-formulas - Delete a cell formula
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseCellFormula } from "@/lib/formula"

/**
 * GET /api/task-lineages/[id]/cell-formulas
 * List all cell formulas for a lineage
 * Query params:
 * - snapshotId?: string - Filter by snapshot (optional)
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
    const { searchParams } = new URL(request.url)
    const snapshotId = searchParams.get("snapshotId")

    // Verify lineage exists and belongs to org
    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId },
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    // Get all cell formulas
    const formulas = await prisma.cellFormula.findMany({
      where: {
        lineageId,
        organizationId,
        ...(snapshotId ? { snapshotId } : {}),
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json({ formulas })
  } catch (error: unknown) {
    console.error("Error listing cell formulas:", error)
    const message = error instanceof Error ? error.message : "Failed to list formulas"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/task-lineages/[id]/cell-formulas
 * Create or update a cell formula (upsert by cellRef + snapshotId)
 *
 * Body:
 * - cellRef: string (A1-style reference, e.g., "B5")
 * - formula: string (e.g., "=SUM(A1:A10)")
 * - snapshotId?: string (optional, null = applies to all/current)
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
    const { organizationId, id: userId } = session.user
    const body = await request.json()

    const { cellRef, formula, snapshotId } = body

    // Validate required fields
    if (!cellRef || typeof cellRef !== "string") {
      return NextResponse.json({ error: "cellRef is required" }, { status: 400 })
    }

    if (!formula || typeof formula !== "string") {
      return NextResponse.json({ error: "formula is required" }, { status: 400 })
    }

    // Validate formula starts with =
    if (!formula.startsWith("=")) {
      return NextResponse.json({ error: "Formula must start with =" }, { status: 400 })
    }

    // Validate cellRef format (basic check)
    if (!/^[A-Z]+[0-9]+$/i.test(cellRef)) {
      return NextResponse.json({ error: "Invalid cell reference format" }, { status: 400 })
    }

    // Validate formula syntax
    const parseResult = parseCellFormula(formula)
    if (!parseResult.ok) {
      return NextResponse.json({ error: `Invalid formula: ${parseResult.error}` }, { status: 400 })
    }

    // Verify lineage exists and belongs to org
    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId },
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    // Find existing formula (upsert doesn't work well with nullable compound keys)
    const existingFormula = await prisma.cellFormula.findFirst({
      where: {
        lineageId,
        organizationId,
        cellRef: cellRef.toUpperCase(),
        snapshotId: snapshotId || null,
      },
    })

    let cellFormula
    if (existingFormula) {
      // Update existing formula
      cellFormula = await prisma.cellFormula.update({
        where: { id: existingFormula.id },
        data: {
          formula,
          updatedAt: new Date(),
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      })
    } else {
      // Create new formula
      cellFormula = await prisma.cellFormula.create({
        data: {
          organizationId,
          lineageId,
          snapshotId: snapshotId || null,
          cellRef: cellRef.toUpperCase(),
          formula,
          createdById: userId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      })
    }

    return NextResponse.json({ formula: cellFormula })
  } catch (error: unknown) {
    console.error("Error saving cell formula:", error)
    const message = error instanceof Error ? error.message : "Failed to save formula"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/task-lineages/[id]/cell-formulas
 * Delete a cell formula
 *
 * Query params:
 * - cellRef: string (required)
 * - snapshotId?: string (optional)
 */
export async function DELETE(
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
    const { searchParams } = new URL(request.url)
    const cellRef = searchParams.get("cellRef")
    const snapshotId = searchParams.get("snapshotId")

    if (!cellRef) {
      return NextResponse.json({ error: "cellRef is required" }, { status: 400 })
    }

    // Verify lineage exists and belongs to org
    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId },
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    // Delete the cell formula
    await prisma.cellFormula.deleteMany({
      where: {
        lineageId,
        organizationId,
        cellRef: cellRef.toUpperCase(),
        snapshotId: snapshotId || null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting cell formula:", error)
    const message = error instanceof Error ? error.message : "Failed to delete formula"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
