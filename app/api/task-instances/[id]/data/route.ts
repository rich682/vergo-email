/**
 * Task Data Status API
 * 
 * GET /api/task-instances/[id]/data
 * 
 * Returns whether Data is enabled for this task and the template details if so.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface SchemaColumn {
  key: string
  label: string
  type: string
  required: boolean
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { organizationId } = session.user
    const { id: taskInstanceId } = await params

    // Fetch the TaskInstance with lineage and datasetTemplate
    const instance = await prisma.taskInstance.findFirst({
      where: {
        id: taskInstanceId,
        organizationId,
      },
      include: {
        lineage: {
          include: {
            datasetTemplate: {
              include: {
                _count: {
                  select: { snapshots: true },
                },
                snapshots: {
                  where: { isLatest: true },
                  take: 1,
                  select: {
                    id: true,
                    rowCount: true,
                    createdAt: true,
                  },
                },
              },
            },
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

    const template = instance.lineage?.datasetTemplate
    const enabled = !!template

    if (!enabled) {
      return NextResponse.json({
        enabled: false,
        datasetTemplate: null,
      })
    }

    // Parse schema
    const schema = Array.isArray(template.schema) 
      ? template.schema as SchemaColumn[] 
      : []

    // Determine if schema is configured (has columns and identity key)
    const schemaConfigured = schema.length > 0 && !!template.identityKey

    return NextResponse.json({
      enabled: true,
      schemaConfigured,
      datasetTemplate: {
        id: template.id,
        name: template.name,
        schema,
        identityKey: template.identityKey,
        snapshotCount: template._count.snapshots,
        latestSnapshot: template.snapshots[0] ? {
          id: template.snapshots[0].id,
          rowCount: template.snapshots[0].rowCount,
          createdAt: template.snapshots[0].createdAt.toISOString(),
        } : null,
      },
    })
  } catch (error: unknown) {
    console.error("Error fetching task data status:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch data status"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
