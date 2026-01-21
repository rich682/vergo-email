import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskType } from "@prisma/client"
import { TableSchema, TableColumn } from "@/lib/services/table-task.service"

/**
 * GET /api/task-lineages/[id]/schema
 * Fetch the schema configuration for a TABLE lineage
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
    const organizationId = session.user.organizationId

    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId }
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    if (lineage.type !== TaskType.TABLE) {
      return NextResponse.json(
        { error: "Schema is only available for TABLE type lineages" },
        { status: 400 }
      )
    }

    const schema = (lineage.config as any) || { columns: [], identityKey: null }

    return NextResponse.json({
      lineageId: lineage.id,
      lineageName: lineage.name,
      schema
    })
  } catch (error: any) {
    console.error("Error fetching lineage schema:", error)
    return NextResponse.json(
      { error: "Failed to fetch schema", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/task-lineages/[id]/schema
 * Update the schema configuration for a TABLE lineage
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: lineageId } = await params
    const organizationId = session.user.organizationId
    const body = await request.json()

    const lineage = await prisma.taskLineage.findFirst({
      where: { id: lineageId, organizationId }
    })

    if (!lineage) {
      return NextResponse.json({ error: "Lineage not found" }, { status: 404 })
    }

    if (lineage.type !== TaskType.TABLE) {
      return NextResponse.json(
        { error: "Schema is only available for TABLE type lineages" },
        { status: 400 }
      )
    }

    // Validate schema structure
    const { columns, identityKey } = body

    if (!columns || !Array.isArray(columns)) {
      return NextResponse.json(
        { error: "Invalid schema: columns array is required" },
        { status: 400 }
      )
    }

    // Validate each column
    const validTypes = ["text", "number", "date", "currency", "percent", "status", "person", "attachment", "notes", "amount", "entity", "formula"]
    const validEditPolicies = ["READ_ONLY_IMPORTED", "EDITABLE_COLLAB", "COMPUTED_ROW", "SYSTEM_VARIANCE"]
    const validSources = ["imported", "manual", "computed", "system"]

    for (const col of columns) {
      if (!col.id || !col.label || !col.type) {
        return NextResponse.json(
          { error: `Invalid column: id, label, and type are required` },
          { status: 400 }
        )
      }

      if (!validTypes.includes(col.type)) {
        return NextResponse.json(
          { error: `Invalid column type: ${col.type}` },
          { status: 400 }
        )
      }

      if (col.editPolicy && !validEditPolicies.includes(col.editPolicy)) {
        return NextResponse.json(
          { error: `Invalid edit policy: ${col.editPolicy}` },
          { status: 400 }
        )
      }

      if (col.source && !validSources.includes(col.source)) {
        return NextResponse.json(
          { error: `Invalid source: ${col.source}` },
          { status: 400 }
        )
      }
    }

    // Validate identity key if provided
    if (identityKey) {
      const identityColumn = columns.find((c: TableColumn) => c.id === identityKey)
      if (!identityColumn) {
        return NextResponse.json(
          { error: `Identity key column '${identityKey}' not found in columns` },
          { status: 400 }
        )
      }
    }

    // Build the schema object with defaults
    const schema: TableSchema = {
      columns: columns.map((col: Partial<TableColumn>) => ({
        id: col.id,
        label: col.label,
        type: col.type || "text",
        source: col.source || "imported",
        editPolicy: col.editPolicy || "READ_ONLY_IMPORTED",
        isIdentity: col.id === identityKey,
        isComparable: col.isComparable || false,
        width: col.width
      })),
      identityKey: identityKey || ""
    }

    // Update the lineage
    const updatedLineage = await prisma.taskLineage.update({
      where: { id: lineageId },
      data: { config: schema as any }
    })

    return NextResponse.json({
      lineageId: updatedLineage.id,
      lineageName: updatedLineage.name,
      schema
    })
  } catch (error: any) {
    console.error("Error updating lineage schema:", error)
    return NextResponse.json(
      { error: "Failed to update schema", message: error.message },
      { status: 500 }
    )
  }
}
