import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TableTaskService, TableSchema } from "@/lib/services/table-task.service"
import { TaskType } from "@prisma/client"

/**
 * GET /api/task-instances/[id]/table/compare
 * Fetch variance data comparing current period to prior period
 * Supports row-level filtering based on rowOwnerColumn
 * 
 * Query params:
 * - filter=mine : Only return rows owned by current user
 * - filter=all : Return all accessible rows (default)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userEmail = session.user.email
    const userRole = (session.user as any).role || 'MEMBER'
    const { id: taskInstanceId } = await params
    
    // Parse filter query param
    const url = new URL(request.url)
    const filterMode = url.searchParams.get('filter') || 'all'

    // Fetch instance with lineage and board
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: {
        lineage: true,
        board: {
          select: { id: true, name: true, periodStart: true, periodEnd: true, cadence: true }
        }
      }
    })

    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    if (instance.type !== TaskType.TABLE) {
      return NextResponse.json(
        { error: "This task is not a Database/Table task" },
        { status: 400 }
      )
    }

    // Check if this is a recurring task (has lineage)
    if (!instance.lineageId) {
      return NextResponse.json(
        { error: "Variance analysis is only available for recurring tasks. Convert this task to recurring to enable comparisons." },
        { status: 400 }
      )
    }

    // Get schema
    const schema = (instance.lineage?.config as any) as TableSchema | null
    if (!schema || !schema.identityKey) {
      return NextResponse.json(
        { error: "Table schema with identity key is required for variance analysis" },
        { status: 400 }
      )
    }

    // Find prior period snapshot
    const priorSnapshot = instance.board?.periodStart
      ? await prisma.taskInstance.findFirst({
          where: {
            lineageId: instance.lineageId,
            organizationId,
            isSnapshot: true,
            board: {
              periodStart: { lt: instance.board.periodStart }
            }
          },
          orderBy: { board: { periodStart: "desc" } },
          include: {
            board: {
              select: { id: true, name: true, periodStart: true, periodEnd: true }
            }
          }
        })
      : null

    if (!priorSnapshot) {
      return NextResponse.json(
        { 
          error: "No prior completed period found for comparison",
          canCompare: false,
          reason: "NO_PRIOR_SNAPSHOT"
        },
        { status: 400 }
      )
    }

    // Get deltas using the service
    const allDeltas = await TableTaskService.getMoMDeltas(taskInstanceId, organizationId)

    if (!allDeltas) {
      return NextResponse.json(
        { error: "Failed to compute variance data" },
        { status: 500 }
      )
    }

    // Apply row-level access control filtering
    const isAdmin = userRole === 'ADMIN'
    let deltas = allDeltas

    if (filterMode === 'mine' && schema.rowOwnerColumn) {
      // "My rows" filter
      deltas = allDeltas.filter(row => {
        const ownerValue = row[schema.rowOwnerColumn!]
        return ownerValue === userEmail || 
               (ownerValue && ownerValue.toLowerCase() === userEmail.toLowerCase())
      })
    } else {
      // Apply access control based on schema settings
      deltas = TableTaskService.filterRowsByOwner(allDeltas, schema, userEmail, userRole)
    }

    // Compute summary statistics on filtered rows
    const addedRows = deltas.filter(r => r._deltaType === "ADDED")
    const changedRows = deltas.filter(r => r._deltaType === "CHANGED")
    const removedRows = deltas.filter(r => r._deltaType === "REMOVED")
    const unchangedRows = deltas.filter(r => r._deltaType === "UNCHANGED")

    // Get comparable columns for summary
    const comparableColumns = schema.columns.filter(c => c.isComparable)

    // Calculate aggregate variance for each comparable column
    const columnSummaries = comparableColumns.map(col => {
      let totalCurrentValue = 0
      let totalPriorValue = 0

      deltas.forEach(row => {
        if (row._deltaType !== "REMOVED") {
          const current = Number(row[col.id]) || 0
          totalCurrentValue += current
        }
        if (row._changes?.[col.id]) {
          totalPriorValue += Number(row._changes[col.id].prior) || 0
        } else if (row._deltaType === "UNCHANGED" || row._deltaType === "REMOVED") {
          // For unchanged rows, current = prior
          totalPriorValue += Number(row[col.id]) || 0
        }
      })

      const totalDelta = totalCurrentValue - totalPriorValue
      const totalDeltaPct = totalPriorValue === 0 
        ? (totalCurrentValue === 0 ? 0 : 100)
        : (totalDelta / totalPriorValue) * 100

      return {
        columnId: col.id,
        columnLabel: col.label,
        columnType: col.type,
        totalCurrentValue,
        totalPriorValue,
        totalDelta,
        totalDeltaPct
      }
    })

    return NextResponse.json({
      taskInstanceId: instance.id,
      taskInstanceName: instance.name,
      currentPeriod: {
        boardId: instance.board?.id,
        boardName: instance.board?.name,
        periodStart: instance.board?.periodStart,
        periodEnd: instance.board?.periodEnd
      },
      priorPeriod: {
        taskInstanceId: priorSnapshot.id,
        boardId: priorSnapshot.board?.id,
        boardName: priorSnapshot.board?.name,
        periodStart: priorSnapshot.board?.periodStart,
        periodEnd: priorSnapshot.board?.periodEnd
      },
      schema,
      rows: deltas,
      summary: {
        totalRows: deltas.length,
        // Only expose unfiltered count to admins to prevent info leak
        ...(isAdmin ? { totalUnfilteredRows: allDeltas.length } : {}),
        addedCount: addedRows.length,
        changedCount: changedRows.length,
        removedCount: removedRows.length,
        unchangedCount: unchangedRows.length,
        columnSummaries
      },
      canCompare: true,
      // Row access info
      rowAccess: {
        mode: schema.rowAccessMode || 'ALL',
        ownerColumn: schema.rowOwnerColumn || null,
        isFiltered: filterMode === 'mine' || (schema.rowAccessMode && schema.rowAccessMode !== 'ALL'),
        isAdmin
      }
    })
  } catch (error: any) {
    console.error("Error fetching variance data:", error)
    return NextResponse.json(
      { error: "Failed to fetch variance data", message: error.message },
      { status: 500 }
    )
  }
}
