import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TableTaskService, TableSchema } from "@/lib/services/table-task.service"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { TaskType } from "@prisma/client"

interface ImportMetadata {
  lastImportedAt: string
  lastImportedBy: string
  lastImportedByEmail: string
  importSource: string | null
  rowsAdded: number
  rowsUpdated: number
  rowsRemoved: number
  totalRows: number
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

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userEmail = session.user.email || "unknown"
    const { id: taskInstanceId } = await params
    const body = await request.json()
    const { rows, filename } = body

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Invalid data: rows array is required" }, { status: 400 })
    }

    // 1. Verify instance exists and is a TABLE type
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { lineage: true }
    })
    
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    if (instance.type !== TaskType.TABLE) {
      return NextResponse.json({ error: "This task is not a Database/Table task" }, { status: 400 })
    }

    // 2. Check immutability (Invariant: Snapshot instances are read-only)
    if (instance.isSnapshot) {
      return NextResponse.json({ error: "Cannot modify a historical snapshot" }, { status: 403 })
    }

    // 3. Validation (Hardening Phase 1)
    if (instance.lineageId) {
      const validation = await TableTaskService.validateRows(instance.lineageId, rows)
      if (!validation.valid) {
        return NextResponse.json({ 
          error: "Validation failed", 
          details: validation.errors 
        }, { status: 400 })
      }
    }

    // 4. Calculate row changes before import
    const currentRows = (instance.structuredData as any[]) || []
    const schema = instance.lineage?.config as any as TableSchema | null
    const identityKey = schema?.identityKey
    
    let rowsAdded = 0
    let rowsUpdated = 0
    let rowsRemoved = 0

    if (identityKey) {
      const currentIdSet = new Set(currentRows.map(r => r[identityKey]))
      const newIdSet = new Set(rows.map((r: any) => r[identityKey]))

      // Count new rows (in import but not in current)
      rows.forEach((newRow: any) => {
        if (!currentIdSet.has(newRow[identityKey])) {
          rowsAdded++
        } else {
          rowsUpdated++ // Assumes all existing rows are updated (could be more precise)
        }
      })

      // Count removed rows (in current but not in import)
      currentRows.forEach(currentRow => {
        if (!newIdSet.has(currentRow[identityKey])) {
          rowsRemoved++
        }
      })
    } else {
      rowsAdded = rows.length
    }

    // 5. Add row-level audit metadata to each row
    const timestamp = new Date().toISOString()
    const rowsWithAudit = rows.map((row: any) => {
      const existingRow = identityKey 
        ? currentRows.find(r => r[identityKey] === row[identityKey])
        : null

      return {
        ...row,
        _audit: {
          importedAt: timestamp,
          importedBy: userId,
          createdAt: existingRow?._audit?.createdAt || timestamp,
          lastModifiedAt: timestamp,
          lastModifiedBy: userId,
        }
      }
    })

    // 6. Perform Import (Two-Plane Merge)
    await TableTaskService.importRows(taskInstanceId, organizationId, rowsWithAudit)

    // 7. Update import metadata in labels
    const importMetadata: ImportMetadata = {
      lastImportedAt: timestamp,
      lastImportedBy: userId,
      lastImportedByEmail: userEmail,
      importSource: filename || null,
      rowsAdded,
      rowsUpdated,
      rowsRemoved,
      totalRows: rows.length,
    }

    const currentLabels = (instance.labels as any) || {}
    await prisma.taskInstance.update({
      where: { id: taskInstanceId },
      data: {
        labels: {
          ...currentLabels,
          importMetadata,
        }
      }
    })

    return NextResponse.json({ 
      success: true, 
      count: rows.length,
      rowsAdded,
      rowsUpdated,
      rowsRemoved,
      importMetadata,
    })

  } catch (error: any) {
    console.error("Table import error:", error)
    return NextResponse.json({ error: "Failed to import data", message: error.message }, { status: 500 })
  }
}
