/**
 * Enable Data for Task API
 * 
 * POST /api/task-instances/[id]/data/enable
 * 
 * Creates a DatasetTemplate and links it to the task's lineage.
 * This is the opt-in mechanism for enabling Data on any task.
 * 
 * Dataset names are auto-generated to avoid conflicts.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Generate a unique dataset name using task name + short unique suffix
 */
function generateDatasetName(taskName: string): string {
  // Use last 6 chars of a random ID for uniqueness
  const suffix = Math.random().toString(36).substring(2, 8)
  return `${taskName}_${suffix}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { organizationId, id: userId } = session.user
    const { id: taskInstanceId } = await params

    // Fetch the TaskInstance
    const instance = await prisma.taskInstance.findFirst({
      where: {
        id: taskInstanceId,
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

    // Check if Data is already enabled (lineage has datasetTemplate)
    if (instance.lineage?.datasetTemplateId) {
      return NextResponse.json(
        { error: "Data is already enabled for this task" },
        { status: 409 }
      )
    }

    // Generate a unique name for the DatasetTemplate
    const templateName = generateDatasetName(instance.name)

    // Create the template and link it to the task in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let lineageId = instance.lineageId

      // If instance doesn't have a lineage, create one
      if (!lineageId) {
        const newLineage = await tx.taskLineage.create({
          data: {
            organizationId,
            name: instance.name,
            description: instance.description,
            type: instance.type,
          },
        })
        lineageId = newLineage.id

        // Link instance to the new lineage
        await tx.taskInstance.update({
          where: { id: taskInstanceId },
          data: { lineageId: newLineage.id },
        })
      }

      // Create the DatasetTemplate with empty schema
      // User will configure schema in the next step
      const template = await tx.datasetTemplate.create({
        data: {
          organizationId,
          name: templateName,
          schema: [], // Empty schema - user will configure
          identityKey: "", // Will be set when schema is configured
          createdById: userId,
        },
      })

      // Link the template to the lineage
      const updatedLineage = await tx.taskLineage.update({
        where: { id: lineageId },
        data: { datasetTemplateId: template.id },
      })

      return { template, lineage: updatedLineage }
    })

    return NextResponse.json({
      enabled: true,
      template: {
        id: result.template.id,
        name: result.template.name,
        schema: result.template.schema,
        identityKey: result.template.identityKey,
      },
      lineage: {
        id: result.lineage.id,
        datasetTemplateId: result.lineage.datasetTemplateId,
      },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error("Error enabling data for task:", error)
    const message = error instanceof Error ? error.message : "Failed to enable data"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
