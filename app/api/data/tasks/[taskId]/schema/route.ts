/**
 * Data Workflow - Task Schema API
 * 
 * POST /api/data/tasks/[taskId]/schema - Creates a DatasetTemplate and links it to the task
 * 
 * Now accepts TaskInstance ID (not TaskLineage ID) because:
 * - The Data workflow now queries TaskInstances
 * - We create/use a TaskLineage to hold the schema linkage
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { SchemaColumn } from "@/lib/services/dataset.service"

// Eligible task types for data attachment
const ELIGIBLE_TASK_TYPES = ["TABLE", "RECONCILIATION"]

interface CreateSchemaRequest {
  name: string
  description?: string
  schema: SchemaColumn[]
  identityKey: string
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

    const { organizationId, id: userId } = session.user
    const { taskId } = await params

    // Validate request body
    const body: CreateSchemaRequest = await request.json()
    const { name, description, schema, identityKey, stakeholderMapping } = body

    if (!name || !schema || !identityKey) {
      return NextResponse.json(
        { error: "Missing required fields: name, schema, identityKey" },
        { status: 400 }
      )
    }

    if (!Array.isArray(schema) || schema.length === 0) {
      return NextResponse.json(
        { error: "Schema must be a non-empty array of columns" },
        { status: 400 }
      )
    }

    // Validate identity key exists in schema
    const identityColumn = schema.find((col) => col.key === identityKey)
    if (!identityColumn) {
      return NextResponse.json(
        { error: "Identity key must reference a column in the schema" },
        { status: 400 }
      )
    }

    // Fetch the TaskInstance
    const instance = await prisma.taskInstance.findFirst({
      where: {
        id: taskId,
        organizationId,
      },
      include: {
        lineage: true,
      },
    })

    if (!instance) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    if (!ELIGIBLE_TASK_TYPES.includes(instance.type)) {
      return NextResponse.json(
        { error: "This task type is not eligible for data schema attachment" },
        { status: 400 }
      )
    }

    // Check if lineage already has a schema
    if (instance.lineage?.datasetTemplateId) {
      return NextResponse.json(
        { error: "This task already has a data schema attached" },
        { status: 409 }
      )
    }

    // Create the template and link it to the task in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the dataset template
      const template = await tx.datasetTemplate.create({
        data: {
          organizationId,
          name,
          description,
          schema,
          identityKey,
          stakeholderMapping: stakeholderMapping 
            ? { columnKey: stakeholderMapping.columnKey, matchedField: "email" } 
            : undefined,
          createdById: userId,
        },
      })

      let lineageId = instance.lineageId

      // If instance doesn't have a lineage, create one
      if (!lineageId) {
        const newLineage = await tx.taskLineage.create({
          data: {
            organizationId,
            name: instance.name,
            description: instance.description,
            type: instance.type,
            datasetTemplateId: template.id,
          },
        })
        lineageId = newLineage.id

        // Link instance to the new lineage
        await tx.taskInstance.update({
          where: { id: taskId },
          data: { lineageId: newLineage.id },
        })

        return { template, lineage: newLineage }
      }

      // Link the template to the existing lineage
      const updatedLineage = await tx.taskLineage.update({
        where: { id: lineageId },
        data: { datasetTemplateId: template.id },
      })

      return { template, lineage: updatedLineage }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    console.error("Error creating data schema for task:", error)

    // Handle unique constraint violation (dataset name already exists)
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "A dataset with this name already exists" },
        { status: 409 }
      )
    }

    const message = error instanceof Error ? error.message : "Failed to create data schema"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
