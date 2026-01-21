import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TableTaskService, TableSchema } from "@/lib/services/table-task.service"
import { TaskType } from "@prisma/client"

interface DeltaSummary {
  identityValue: any
  columnId: string
  columnLabel: string
  priorValue: number
  newValue: number
  delta: number
  deltaPct: number
}

interface SampleChange {
  identityValue: any
  changes: Record<string, { prior: any; new: any }>
}

interface PreviewResponse {
  valid: boolean
  summary: {
    rowsAdded: number
    rowsUpdated: number
    rowsRemoved: number
    rowsUnchanged: number
    totalInFile: number
    totalCurrent: number
  }
  topDeltas: DeltaSummary[]
  errors: Array<{ row: number; error: string }>
  sampleChanges: SampleChange[]
  warnings: string[]
}

/**
 * POST /api/task-instances/[id]/table/preview-import
 * Preview import changes before committing
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const { id: taskInstanceId } = await params
    const body = await request.json()
    const { rows: newRows, filename } = body

    if (!newRows || !Array.isArray(newRows)) {
      return NextResponse.json({ error: "Invalid data: rows array is required" }, { status: 400 })
    }

    // Fetch instance with lineage
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { lineage: true }
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

    if (instance.isSnapshot) {
      return NextResponse.json(
        { error: "Cannot import to a historical snapshot" },
        { status: 403 }
      )
    }

    const schema = instance.lineage?.config as any as TableSchema | null
    
    if (!schema || !schema.identityKey) {
      return NextResponse.json(
        { error: "Table schema with identity key is required" },
        { status: 400 }
      )
    }

    const currentRows = (instance.structuredData as any[]) || []
    const identityKey = schema.identityKey
    const errors: Array<{ row: number; error: string }> = []
    const warnings: string[] = []

    // Validate identity keys
    const seenKeys = new Set<string>()
    const currentKeySet = new Set(currentRows.map(r => String(r[identityKey])))

    newRows.forEach((row: any, index: number) => {
      const keyValue = row[identityKey]
      
      // Check for missing identity key
      if (keyValue === undefined || keyValue === null || keyValue === '') {
        errors.push({ row: index, error: `Missing identity key (${identityKey})` })
        return
      }

      const keyStr = String(keyValue)

      // Check for duplicates within the file
      if (seenKeys.has(keyStr)) {
        errors.push({ row: index, error: `Duplicate identity key: ${keyValue}` })
      }
      seenKeys.add(keyStr)
    })

    // Type validation for columns
    schema.columns.forEach(col => {
      if (col.source !== 'imported') return
      
      newRows.forEach((row: any, index: number) => {
        const val = row[col.id]
        if (val === undefined || val === null || val === '') return

        if ((col.type === 'number' || col.type === 'amount' || col.type === 'currency' || col.type === 'percent')) {
          const numVal = parseFloat(String(val).replace(/[^0-9.-]/g, ''))
          if (isNaN(numVal)) {
            errors.push({ row: index, error: `Column "${col.label}" must be a number (found: "${val}")` })
          }
        }
        if (col.type === 'date' && isNaN(Date.parse(String(val)))) {
          errors.push({ row: index, error: `Column "${col.label}" must be a valid date (found: "${val}")` })
        }
      })
    })

    // Calculate row counts
    let rowsAdded = 0
    let rowsUpdated = 0
    let rowsUnchanged = 0

    const newKeySet = new Set(newRows.map((r: any) => String(r[identityKey])))
    const rowsRemoved = currentRows.filter(r => !newKeySet.has(String(r[identityKey]))).length

    // Calculate changes and find top deltas
    const comparableCols = schema.columns.filter(c => c.isComparable)
    const allDeltas: DeltaSummary[] = []
    const sampleChanges: SampleChange[] = []

    newRows.forEach((newRow: any) => {
      const keyValue = newRow[identityKey]
      const currentRow = currentRows.find(r => String(r[identityKey]) === String(keyValue))

      if (!currentRow) {
        rowsAdded++
        return
      }

      // Check if any comparable column changed
      let hasChanges = false
      const rowChanges: Record<string, { prior: any; new: any }> = {}

      comparableCols.forEach(col => {
        const currentVal = currentRow[col.id]
        const newVal = newRow[col.id]

        // Normalize values for comparison
        const normalizedCurrent = normalizeValue(currentVal, col.type)
        const normalizedNew = normalizeValue(newVal, col.type)

        if (normalizedCurrent !== normalizedNew) {
          hasChanges = true
          rowChanges[col.id] = { prior: currentVal, new: newVal }

          // Calculate delta for numeric types
          if (col.type === 'number' || col.type === 'amount' || col.type === 'currency' || col.type === 'percent') {
            const numCurrent = parseFloat(String(currentVal || 0).replace(/[^0-9.-]/g, '')) || 0
            const numNew = parseFloat(String(newVal || 0).replace(/[^0-9.-]/g, '')) || 0
            const delta = numNew - numCurrent
            const deltaPct = numCurrent === 0 ? (numNew === 0 ? 0 : 100) : (delta / numCurrent) * 100

            allDeltas.push({
              identityValue: keyValue,
              columnId: col.id,
              columnLabel: col.label,
              priorValue: numCurrent,
              newValue: numNew,
              delta,
              deltaPct
            })
          }
        }
      })

      if (hasChanges) {
        rowsUpdated++
        if (sampleChanges.length < 5) {
          sampleChanges.push({ identityValue: keyValue, changes: rowChanges })
        }
      } else {
        rowsUnchanged++
      }
    })

    // Sort deltas by absolute delta percentage (largest first)
    allDeltas.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    const topDeltas = allDeltas.slice(0, 5)

    // Add warnings
    if (rowsRemoved > 0) {
      warnings.push(`${rowsRemoved} row(s) will be removed (not in import file)`)
    }
    if (rowsAdded > 10 && rowsAdded > currentRows.length * 0.5) {
      warnings.push(`Large number of new rows (${rowsAdded}) - verify this is expected`)
    }

    const response: PreviewResponse = {
      valid: errors.length === 0,
      summary: {
        rowsAdded,
        rowsUpdated,
        rowsRemoved,
        rowsUnchanged,
        totalInFile: newRows.length,
        totalCurrent: currentRows.length
      },
      topDeltas,
      errors: errors.slice(0, 20), // Limit to first 20 errors
      sampleChanges,
      warnings
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("Import preview error:", error)
    return NextResponse.json(
      { error: "Failed to preview import", message: error.message },
      { status: 500 }
    )
  }
}

// Normalize value for comparison
function normalizeValue(val: any, type: string): string {
  if (val === undefined || val === null) return ''
  
  if (type === 'number' || type === 'amount' || type === 'currency' || type === 'percent') {
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''))
    return isNaN(num) ? '' : num.toFixed(2)
  }
  
  return String(val).trim().toLowerCase()
}
