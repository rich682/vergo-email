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

interface StakeholderMapping {
  columnKey: string
  matchedField: string
  visibility?: "own_rows" | "all_rows"
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
                // Fetch all snapshots for the sheet selector (metadata only)
                snapshots: {
                  orderBy: { createdAt: "desc" },
                  select: {
                    id: true,
                    periodLabel: true,
                    periodStart: true,
                    rowCount: true,
                    createdAt: true,
                    isLatest: true,
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

    // Parse stakeholder mapping
    const stakeholderMapping = template.stakeholderMapping as StakeholderMapping | null

    // Determine if schema is configured (has columns and identity key)
    const schemaConfigured = schema.length > 0 && !!template.identityKey

    // Find the latest snapshot
    const latestSnapshot = template.snapshots.find(s => s.isLatest) || template.snapshots[0] || null

    return NextResponse.json({
      enabled: true,
      schemaConfigured,
      datasetTemplate: {
        id: template.id,
        name: template.name,
        schema,
        identityKey: template.identityKey,
        stakeholderMapping: stakeholderMapping || null,
        snapshotCount: template._count.snapshots,
        latestSnapshot: latestSnapshot ? {
          id: latestSnapshot.id,
          rowCount: latestSnapshot.rowCount,
          createdAt: latestSnapshot.createdAt.toISOString(),
          periodLabel: latestSnapshot.periodLabel || null,
        } : null,
        // All snapshots metadata for sheet selector
        snapshots: template.snapshots.map(s => ({
          id: s.id,
          periodLabel: s.periodLabel || null,
          periodStart: s.periodStart?.toISOString() || null,
          rowCount: s.rowCount,
          createdAt: s.createdAt.toISOString(),
          isLatest: s.isLatest,
        })),
      },
    })
  } catch (error: unknown) {
    console.error("Error fetching task data status:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch data status"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/task-instances/[id]/data
 * 
 * Update data settings (stakeholder visibility)
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

    const { organizationId } = session.user
    const { id: taskInstanceId } = await params
    const body = await request.json()
    const { stakeholderVisibility } = body as { stakeholderVisibility: "own_rows" | "all_rows" }

    // Fetch the TaskInstance with lineage and datasetTemplate
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
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const template = instance.lineage?.datasetTemplate
    if (!template) {
      return NextResponse.json({ error: "Data not enabled for this task" }, { status: 400 })
    }

    const currentMapping = template.stakeholderMapping as StakeholderMapping | null
    if (!currentMapping?.columnKey) {
      return NextResponse.json({ error: "No stakeholder column configured" }, { status: 400 })
    }

    // Update the stakeholder mapping with visibility setting
    const updatedMapping: StakeholderMapping = {
      ...currentMapping,
      visibility: stakeholderVisibility,
    }

    await prisma.datasetTemplate.update({
      where: { id: template.id },
      data: { stakeholderMapping: updatedMapping },
    })

    return NextResponse.json({ success: true, stakeholderMapping: updatedMapping })
  } catch (error: unknown) {
    console.error("Error updating data settings:", error)
    const message = error instanceof Error ? error.message : "Failed to update settings"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
