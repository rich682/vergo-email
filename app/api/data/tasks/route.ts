/**
 * Data Workflow - Tasks API
 * 
 * GET /api/data/tasks - Returns tasks eligible for data attachment with their data state
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
  id: string
  name: string
  type: "TABLE" | "RECONCILIATION"
  description: string | null
  instanceCount: number
  dataState: DataState
  // Board info from latest instance
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

    // Fetch eligible task lineages with their data linkage state and board info
    const lineages = await prisma.taskLineage.findMany({
      where: {
        organizationId,
        type: { in: ELIGIBLE_TASK_TYPES as unknown as string[] },
      },
      include: {
        _count: {
          select: { instances: true },
        },
        // Get latest instance to get board info
        instances: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            board: {
              select: {
                name: true,
                cadence: true,
                periodStart: true,
                periodEnd: true,
              },
            },
          },
        },
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
      orderBy: { name: "asc" },
    })

    // Transform to response format
    const tasks: TaskDataResponse[] = lineages.map((lineage) => {
      const template = lineage.datasetTemplate
      const latestInstance = lineage.instances[0]
      const board = latestInstance?.board
      
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
        id: lineage.id,
        name: lineage.name,
        type: lineage.type as "TABLE" | "RECONCILIATION",
        description: lineage.description,
        instanceCount: lineage._count.instances,
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
