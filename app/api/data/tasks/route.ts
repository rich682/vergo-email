/**
 * Data Workflow - Tasks API
 * 
 * GET /api/data/tasks - Returns tasks eligible for data attachment with their data state
 * 
 * Now queries TaskInstance directly (not TaskLineage) because:
 * - TaskInstance has direct board linkage (Board Name, Cadence, Period)
 * - The Jobs page shows TaskInstances
 * - Users interact with TaskInstances, not TaskLineages
 * 
 * DatasetTemplate linkage is accessed through TaskInstance -> TaskLineage -> DatasetTemplate
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Eligible task types for data attachment
const ELIGIBLE_TASK_TYPES = ["TABLE", "RECONCILIATION"] as const

export type DataState = "no_schema" | "schema_only" | "has_data"

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
  type: "TABLE" | "RECONCILIATION"
  description: string | null
  dataState: DataState
  // Board info (directly from TaskInstance's board)
  boardName: string | null
  cadence: string | null
  accountingPeriod: string | null
  datasetTemplate?: {
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

    // Fetch eligible TaskInstances (actual tasks on boards) with their lineage and data linkage
    const instances = await prisma.taskInstance.findMany({
      where: {
        organizationId,
        type: { in: ELIGIBLE_TASK_TYPES as unknown as string[] },
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
    const tasks: TaskDataResponse[] = instances.map((instance) => {
      const template = instance.lineage?.datasetTemplate
      const board = instance.board
      
      // Derive data state
      let dataState: DataState = "no_schema"
      if (template) {
        dataState = template._count.snapshots > 0 ? "has_data" : "schema_only"
      }

      // Format accounting period from board dates
      let accountingPeriod: string | null = null
      if (board?.periodStart && board?.periodEnd) {
        const start = new Date(board.periodStart)
        const end = new Date(board.periodEnd)
        const startMonth = start.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        const endMonth = end.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        accountingPeriod = startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`
      }

      const result: TaskDataResponse = {
        id: instance.id,
        lineageId: instance.lineageId,
        name: instance.name,
        type: instance.type as "TABLE" | "RECONCILIATION",
        description: instance.description,
        dataState,
        boardName: board?.name || null,
        cadence: board?.cadence || null,
        accountingPeriod,
      }

      if (template) {
        const schemaColumns = Array.isArray(template.schema) ? template.schema as SchemaColumn[] : []
        result.datasetTemplate = {
          id: template.id,
          name: template.name,
          schema: schemaColumns,
          identityKey: template.identityKey,
          columnCount: schemaColumns.length,
          snapshotCount: template._count.snapshots,
        }

        if (template.snapshots.length > 0) {
          result.datasetTemplate.latestSnapshot = {
            id: template.snapshots[0].id,
            rowCount: template.snapshots[0].rowCount,
            createdAt: template.snapshots[0].createdAt.toISOString(),
          }
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
