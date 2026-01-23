/**
 * Data Workflow - Task Schema API
 * 
 * POST /api/data/tasks/[taskId]/schema - Updates the DatasetTemplate schema for a task
 * 
 * Flow:
 * 1. User enables Data via /api/task-instances/[id]/data/enable (creates empty template)
 * 2. User configures schema via this endpoint (updates the template)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { SchemaColumn, IdentityConfig } from "@/lib/services/dataset.service"

interface UpdateSchemaRequest {
  schema: SchemaColumn[]
  identity?: IdentityConfig        // New: structured identity config
  identityKey?: string             // Legacy: for backwards compatibility
  stakeholderMapping?: { columnKey: string } | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { organizationId } = session.user
    const { taskId } = await params

    // Validate request body
    const body: UpdateSchemaRequest = await request.json()
    const { schema, identity, identityKey, stakeholderMapping } = body

    // Resolve identity config (support both new and legacy)
    const resolvedIdentity: IdentityConfig = identity ?? {
      orientation: "row",
      rowKey: identityKey!
    }

    if (!schema || !resolvedIdentity.rowKey) {
      return NextResponse.json(
        { error: "Missing required fields: schema, identity (or identityKey)" },
        { status: 400 }
      )
    }

    if (!Array.isArray(schema) || schema.length === 0) {
      return NextResponse.json(
        { error: "Schema must be a non-empty array of columns" },
        { status: 400 }
      )
    }

    // Validate rowKey exists in schema
    const rowKeyColumn = schema.find((col) => col.key === resolvedIdentity.rowKey)
    if (!rowKeyColumn) {
      return NextResponse.json(
        { error: "Row key must reference a column in the schema" },
        { status: 400 }
      )
    }

    // Validate column-based identity config
    if (resolvedIdentity.orientation === "column" && !resolvedIdentity.columnIdentitySource) {
      return NextResponse.json(
        { error: "Column-based orientation requires columnIdentitySource" },
        { status: 400 }
      )
    }

    // Fetch the TaskInstance with its lineage and template
    const instance = await prisma.taskInstance.findFirst({
      where: {
        id: taskId,
        organizationId,
      },
      include: {
        lineage: {
          include: {
            datasetTemplate: true,
          },
        },
      },
    })

    if (!instance) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    // Check if Data is enabled (template exists)
    if (!instance.lineage?.datasetTemplateId || !instance.lineage.datasetTemplate) {
      return NextResponse.json(
        { error: "Data is not enabled for this task. Enable Data first." },
        { status: 400 }
      )
    }

    // Update the existing template with the schema and identity config
    const updatedTemplate = await prisma.datasetTemplate.update({
      where: { id: instance.lineage.datasetTemplateId },
      data: {
        schema,
        identityKey: resolvedIdentity.rowKey,  // Keep for backwards compatibility
        identity: resolvedIdentity,
        stakeholderMapping: stakeholderMapping 
          ? { columnKey: stakeholderMapping.columnKey, matchedField: "email" } 
          : undefined,
      },
    })

    return NextResponse.json({
      template: updatedTemplate,
      lineage: instance.lineage,
    }, { status: 200 })
  } catch (error: unknown) {
    console.error("Error updating data schema for task:", error)
    const message = error instanceof Error ? error.message : "Failed to update data schema"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
