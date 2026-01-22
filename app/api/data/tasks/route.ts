/**
 * Data Workflow - Tasks API
 * 
 * GET /api/data/tasks - Returns tasks with Data ENABLED (opt-in model)
 * 
 * OPT-IN MODEL:
 * - Data is available for ALL task types
 * - A task only appears here AFTER user enables Data via the task's Data tab
 * - "Data enabled" = task's lineage has a linked DatasetTemplate
 * 
 * DatasetTemplate linkage: TaskInstance -> TaskLineage -> DatasetTemplate
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Data state for enabled tasks (no "no_schema" since all tasks here are enabled)
export type DataState = "schema_only" | "has_data"

interface SchemaColumn {
  key: string
  label: string
  type: string
  required: boolean
}

export interface TaskDataResponse {
  id: string // TaskInstance ID
  lineageId: string | null // TaskLineage ID for schema linkage
  name: string
  type: string // Any task type (no filtering)
  description: string | null
  dataState: DataState
  // Board info (directly from TaskInstance's board)
  boardName: string | null
  cadence: string | null
  accountingPeriod: string | null
  datasetTemplate: {
    id: string
    name: string
    schema: SchemaColumn[]
    identityKey: string
    columnCount: number
    snapshotCount: number
    latestSnapshot?: {
      id: string
      rowCount: number
      createdAt: string
    }
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { organizationId } = session.user

    // Fetch TaskInstances with Data ENABLED (lineage has datasetTemplate)
    // This is the opt-in filter - no task type restriction
    const instances = await prisma.taskInstance.findMany({
      where: {
        organizationId,
        lineage: {
          datasetTemplateId: { not: null },
        },
      },
      include: {
        board: {
          select: {
            name: true,
            cadence: true,
            periodStart: true,
            periodEnd: true,
          },
        },
        // Get lineage for schema linkage
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
      orderBy: { name: "asc" },
    })

    // Transform to response format
    // All tasks here have Data enabled (datasetTemplate exists due to query filter)
    const tasks: TaskDataResponse[] = instances
      .filter((instance) => instance.lineage?.datasetTemplate) // Safety filter
      .map((instance) => {
        const template = instance.lineage!.datasetTemplate!
        const board = instance.board
        
        // Derive data state - only schema_only or has_data (no no_schema)
        const dataState: DataState = template._count.snapshots > 0 ? "has_data" : "schema_only"

        // Format accounting period from board dates
        let accountingPeriod: string | null = null
        if (board?.periodStart && board?.periodEnd) {
          const start = new Date(board.periodStart)
          const end = new Date(board.periodEnd)
          const startMonth = start.toLocaleDateString("en-US", { month: "short", year: "numeric" })
          const endMonth = end.toLocaleDateString("en-US", { month: "short", year: "numeric" })
          accountingPeriod = startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`
        }

        const schemaColumns = Array.isArray(template.schema) ? template.schema as SchemaColumn[] : []

        const result: TaskDataResponse = {
          id: instance.id,
          lineageId: instance.lineageId,
          name: instance.name,
          type: instance.type,
          description: instance.description,
          dataState,
          boardName: board?.name || null,
          cadence: board?.cadence || null,
          accountingPeriod,
          datasetTemplate: {
            id: template.id,
            name: template.name,
            schema: schemaColumns,
            identityKey: template.identityKey,
            columnCount: schemaColumns.length,
            snapshotCount: template._count.snapshots,
          },
        }

        if (template.snapshots.length > 0) {
          result.datasetTemplate.latestSnapshot = {
            id: template.snapshots[0].id,
            rowCount: template.snapshots[0].rowCount,
            createdAt: template.snapshots[0].createdAt.toISOString(),
          }
        }

        return result
      })

    return NextResponse.json({ tasks })
  } catch (error: unknown) {
    console.error("Error fetching tasks for data workflow:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch tasks"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
