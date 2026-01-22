/**
 * Data Workflow - Task Schema API
 * 
 * POST /api/data/tasks/[lineageId]/schema - Creates a DatasetTemplate and links it to the task
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
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lineageId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { organizationId, id: userId } = session.user
    const { lineageId } = await params

    // Validate request body
    const body: CreateSchemaRequest = await request.json()
    const { name, description, schema, identityKey } = body

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

    // Fetch the task lineage and verify eligibility
    const lineage = await prisma.taskLineage.findFirst({
      where: {
        id: lineageId,
        organizationId,
      },
    })

    if (!lineage) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      )
    }

    if (!ELIGIBLE_TASK_TYPES.includes(lineage.type)) {
      return NextResponse.json(
        { error: "This task type is not eligible for data schema attachment" },
        { status: 400 }
      )
    }

    if (lineage.datasetTemplateId) {
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
          createdById: userId,
        },
      })

      // Link the template to the task lineage
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
