import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskType } from "@prisma/client"
import { TableSchema, TableTaskService } from "@/lib/services/table-task.service"

/**
 * GET /api/task-instances/[id]/table/rows
 * Fetch rows with computed status badges (for current vs prior period)
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
          select: { id: true, name: true, periodStart: true, cadence: true }
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

    const schema = (instance.lineage?.config as any) as TableSchema | null
    const rows = (instance.structuredData as any[]) || []

    // Get import metadata from labels if available
    const importMetadata = (instance.labels as any)?.importMetadata || null

    // If this is a recurring task with a prior snapshot, compute deltas
    let priorSnapshot = null
    if (instance.lineageId && instance.board?.periodStart) {
      priorSnapshot = await prisma.taskInstance.findFirst({
        where: {
          lineageId: instance.lineageId,
          organizationId,
          isSnapshot: true,
          board: {
            periodStart: { lt: instance.board.periodStart }
          }
        },
        orderBy: { board: { periodStart: "desc" } },
        select: {
          id: true,
          structuredData: true,
          board: { select: { periodStart: true, name: true } }
        }
      })
    }

    let processedRows = rows
    
    // If we have a prior snapshot and a schema with identity key, compute deltas
    if (priorSnapshot && schema?.identityKey) {
      const identityKey = schema.identityKey
      const priorRows = (priorSnapshot.structuredData as any[]) || []
      const priorRowMap = new Map(priorRows.map(r => [r[identityKey], r]))
      
      const comparableCols = schema.columns.filter(c => c.isComparable)

      processedRows = rows.map(row => {
        const idValue = row[identityKey]
        const priorRow = priorRowMap.get(idValue)

        if (!priorRow) {
          return { ...row, _deltaType: "ADDED" }
        }

        // Check for changes in comparable columns
        const changes: Record<string, { prior: any; current: any; delta: number; deltaPct: number }> = {}
        let hasChanges = false

        comparableCols.forEach(col => {
          const cVal = row[col.id]
          const pVal = priorRow[col.id]

          if (cVal !== pVal) {
            hasChanges = true
            if (col.type === "number" || col.type === "amount" || col.type === "currency" || col.type === "percent") {
              const delta = (Number(cVal) || 0) - (Number(pVal) || 0)
              const deltaPct = Number(pVal) === 0 ? (Number(cVal) === 0 ? 0 : 100) : (delta / Number(pVal)) * 100
              changes[col.id] = { prior: pVal, current: cVal, delta, deltaPct }
            } else {
              changes[col.id] = { prior: pVal, current: cVal, delta: 0, deltaPct: 0 }
            }
          }
        })

        return {
          ...row,
          _deltaType: hasChanges ? "CHANGED" : "UNCHANGED",
          _changes: Object.keys(changes).length > 0 ? changes : undefined
        }
      })

      // Add removed rows from prior period
      const currentIdSet = new Set(rows.map(r => r[identityKey]))
      priorRows.forEach(pRow => {
        if (!currentIdSet.has(pRow[identityKey])) {
          processedRows.push({
            ...pRow,
            _deltaType: "REMOVED"
          })
        }
      })
    }

    // Apply row-level access control filtering
    let filteredRows = processedRows
    let ownershipStats = null
    const isAdmin = userRole === 'ADMIN'

    if (schema) {
      // Get ownership stats for admin users
      if (isAdmin && schema.rowOwnerColumn) {
        ownershipStats = TableTaskService.getRowOwnershipStats(processedRows, schema)
      }

      // Apply filtering based on access mode and filter query
      if (filterMode === 'mine' && schema.rowOwnerColumn) {
        // "My rows" filter - only show rows owned by current user
        filteredRows = processedRows.filter(row => {
          const ownerValue = row[schema.rowOwnerColumn!]
          return ownerValue === userEmail || 
                 (ownerValue && ownerValue.toLowerCase() === userEmail.toLowerCase())
        })
      } else {
        // Apply access control based on schema settings
        filteredRows = TableTaskService.filterRowsByOwner(
          processedRows,
          schema,
          userEmail,
          userRole
        )
      }
    }

    return NextResponse.json({
      taskInstanceId: instance.id,
      taskInstanceName: instance.name,
      schema,
      rows: filteredRows,
      totalRows: rows.length,
      filteredCount: filteredRows.length,
      isSnapshot: instance.isSnapshot,
      importMetadata,
      priorPeriod: priorSnapshot ? {
        id: priorSnapshot.id,
        periodStart: priorSnapshot.board?.periodStart,
        boardName: priorSnapshot.board?.name
      } : null,
      // Row access info
      rowAccess: {
        mode: schema?.rowAccessMode || 'ALL',
        ownerColumn: schema?.rowOwnerColumn || null,
        isFiltered: filterMode === 'mine' || (schema?.rowAccessMode && schema.rowAccessMode !== 'ALL'),
        isAdmin,
        ownershipStats: isAdmin ? ownershipStats : undefined
      }
    })
  } catch (error: any) {
    console.error("Error fetching table rows:", error)
    return NextResponse.json(
      { error: "Failed to fetch rows", message: error.message },
      { status: 500 }
    )
  }
}
