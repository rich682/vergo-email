import { prisma } from "@/lib/prisma"
import { TaskInstanceService } from "./task-instance.service"
import { TaskType } from "@prisma/client"

export type ColumnEditPolicy = 'READ_ONLY_IMPORTED' | 'EDITABLE_COLLAB' | 'COMPUTED_ROW' | 'SYSTEM_VARIANCE';
export type ColumnSource = 'imported' | 'manual' | 'computed' | 'system';

export interface TableColumn {
  id: string
  label: string
  type: "text" | "number" | "date" | "currency" | "percent" | "status" | "person" | "attachment" | "notes" | "amount" | "entity" | "formula"
  source: ColumnSource
  editPolicy: ColumnEditPolicy
  isIdentity?: boolean
  isComparable?: boolean
  width?: number
}

export type RowAccessMode = 'ALL' | 'OWNER_ONLY' | 'OWNER_AND_ADMINS';
export type CompletionRule = 'DATASET_SIGNOFF' | 'ALL_ROWS_VERIFIED' | 'NO_REQUIREMENT';

export interface TableSchema {
  columns: TableColumn[]
  identityKey: string
  // Row-level access control
  rowOwnerColumn?: string        // Column ID containing PM email/userId
  rowAccessMode?: RowAccessMode  // Default: 'ALL'
  // Completion semantics
  completionRule?: CompletionRule // Default: 'NO_REQUIREMENT'
}

export class TableTaskService {
  /**
   * Update table schema for a lineage
   */
  static async updateSchema(lineageId: string, schema: TableSchema) {
    return prisma.taskLineage.update({
      where: { id: lineageId },
      data: { config: schema as any }
    })
  }

  /**
   * Import rows into a task instance
   * Merges imported data while preserving collaboration plane values.
   */
  static async importRows(
    taskInstanceId: string,
    organizationId: string,
    newRows: any[]
  ) {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { lineage: true }
    })

    if (!instance || instance.type !== TaskType.TABLE) {
      throw new Error("Invalid task instance for table import")
    }

    if (instance.isSnapshot) {
      throw new Error("Cannot modify a historical snapshot")
    }

    const schema = instance.lineage?.config as any as TableSchema
    if (!schema || !schema.identityKey) {
      throw new Error("Table schema or identity key not defined for lineage")
    }

    const identityKey = schema.identityKey
    const currentRows = (instance.structuredData as any[]) || []
    
    // Identify collaboration columns
    const collabColIds = schema.columns
      .filter(c => c.editPolicy === 'EDITABLE_COLLAB')
      .map(c => c.id)

    // Merge logic: For each new row, try to find existing row by identityKey
    const mergedRows = newRows.map(newRow => {
      const idValue = newRow[identityKey]
      const existingRow = currentRows.find(r => r[identityKey] === idValue)
      
      if (!existingRow) return newRow

      // Preserve collaboration data
      const mergedRow = { ...newRow }
      collabColIds.forEach(colId => {
        if (existingRow[colId] !== undefined) {
          mergedRow[colId] = existingRow[colId]
        }
      })
      
      return mergedRow
    })

    return prisma.taskInstance.update({
      where: { id: taskInstanceId },
      data: { 
        structuredData: mergedRows as any,
        status: "IN_PROGRESS"
      }
    })
  }

  /**
   * Update a specific cell in the collaboration plane
   */
  static async updateCollaborationCell(
    taskInstanceId: string,
    organizationId: string,
    identityValue: any,
    columnId: string,
    value: any
  ) {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { lineage: true }
    })

    if (!instance || instance.isSnapshot) {
      throw new Error("Invalid instance or snapshot is read-only")
    }

    const schema = instance.lineage?.config as any as TableSchema
    const column = schema.columns.find(c => c.id === columnId)

    if (!column || column.editPolicy !== 'EDITABLE_COLLAB') {
      throw new Error("Column is not editable or does not exist")
    }

    const rows = (instance.structuredData as any[]) || []
    const rowIndex = rows.findIndex(r => r[schema.identityKey] === identityValue)

    if (rowIndex === -1) {
      throw new Error("Row not found")
    }

    rows[rowIndex][columnId] = value

    return prisma.taskInstance.update({
      where: { id: taskInstanceId },
      data: { structuredData: rows as any }
    })
  }

  /**
   * Link an evidence item (attachment) to a specific row
   */
  static async linkEvidenceToRow(
    taskInstanceId: string,
    organizationId: string,
    identityValue: any,
    columnId: string,
    attachmentId: string
  ) {
    return this.updateCollaborationCell(
      taskInstanceId,
      organizationId,
      identityValue,
      columnId,
      attachmentId
    )
  }

  /**
   * Sign off on a row (mark as verified)
   */
  static async signOffRow(
    taskInstanceId: string,
    organizationId: string,
    identityValue: any,
    statusColumnId: string,
    notesColumnId?: string,
    note?: string
  ) {
    const rows = await this.updateCollaborationCell(
      taskInstanceId,
      organizationId,
      identityValue,
      statusColumnId,
      "VERIFIED"
    )

    if (notesColumnId && note) {
      return this.updateCollaborationCell(
        taskInstanceId,
        organizationId,
        identityValue,
        notesColumnId,
        note
      )
    }

    return rows
  }

  /**
   * Validate rows for a table task
   */
  static async validateRows(lineageId: string, rows: any[]) {
    const lineage = await prisma.taskLineage.findUnique({
      where: { id: lineageId }
    })
    
    if (!lineage || lineage.type !== TaskType.TABLE) {
      throw new Error("Invalid lineage for table validation")
    }

    const schema = lineage.config as any as TableSchema
    const identityKey = schema.identityKey
    
    const errors: Array<{ row: number; error: string }> = []
    const seenKeys = new Set()

    rows.forEach((row, index) => {
      if (identityKey && !row[identityKey]) {
        errors.push({ row: index, error: `Missing identity key: ${identityKey}` })
      } else if (identityKey) {
        const key = row[identityKey]
        if (seenKeys.has(key)) {
          errors.push({ row: index, error: `Duplicate identity key: ${key}` })
        }
        seenKeys.add(key)
      }

      // Type validation
      schema.columns.forEach(col => {
        const val = row[col.id]
        if (val === undefined || val === null) return

        if ((col.type === "number" || col.type === "amount") && isNaN(Number(val))) {
          errors.push({ row: index, error: `Column ${col.label} must be a number` })
        }
        if (col.type === "date" && isNaN(Date.parse(val))) {
          errors.push({ row: index, error: `Column ${col.label} must be a valid date` })
        }
      })
    })

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Get deltas between current and prior period
   * Follows the Variance Analysis Model: compares only marked columns.
   */
  static async getMoMDeltas(taskInstanceId: string, organizationId: string) {
    const current = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { board: true, lineage: true }
    })

    if (!current || !current.lineageId || !current.board?.periodStart) return null

    // Find prior complete instance in the same lineage
    const prior = await prisma.taskInstance.findFirst({
      where: {
        lineageId: current.lineageId,
        organizationId,
        isSnapshot: true,
        board: {
          periodStart: { lt: current.board.periodStart }
        }
      },
      orderBy: { board: { periodStart: "desc" } }
    })

    if (!current.structuredData) return null

    const schema = current.lineage?.config as any as TableSchema
    const identityKey = schema.identityKey
    const comparableCols = schema.columns.filter(c => c.isComparable)

    const currentRows = (current.structuredData as any[]) || []
    const priorRows = (prior?.structuredData as any[]) || []

    const deltas = currentRows.map(cRow => {
      const pRow = priorRows.find(p => p[identityKey] === cRow[identityKey])
      if (!pRow) return { ...cRow, _deltaType: "ADDED" }
      
      const changes: Record<string, { prior: any, current: any, delta: number, deltaPct: number }> = {}
      let hasChanges = false

      comparableCols.forEach(col => {
        const cVal = cRow[col.id]
        const pVal = pRow[col.id]
        
        if (cVal !== pVal) {
          hasChanges = true
          // Handle all numeric types for delta calculation
          if (col.type === 'number' || col.type === 'amount' || col.type === 'currency' || col.type === 'percent') {
            const delta = (Number(cVal) || 0) - (Number(pVal) || 0)
            const deltaPct = Number(pVal) === 0 ? 100 : (delta / Number(pVal)) * 100
            changes[col.id] = { prior: pVal, current: cVal, delta, deltaPct }
          } else {
            changes[col.id] = { prior: pVal, current: cVal, delta: 0, deltaPct: 0 }
          }
        }
      })

      return { 
        ...cRow, 
        _deltaType: hasChanges ? "CHANGED" : "UNCHANGED", 
        _changes: changes 
      }
    })

    // Detect removed rows
    const removedRows = priorRows
      .filter(pRow => !currentRows.find(c => c[identityKey] === pRow[identityKey]))
      .map(pRow => ({ ...pRow, _deltaType: "REMOVED" }))

    return [...deltas, ...removedRows]
  }

  /**
   * Filter rows based on row-level access control
   * @param rows - All rows from structuredData
   * @param schema - Table schema with rowOwnerColumn and rowAccessMode
   * @param userEmail - Current user's email
   * @param userRole - Current user's role (ADMIN, MEMBER, VIEWER)
   * @returns Filtered rows based on access control
   */
  static filterRowsByOwner(
    rows: any[],
    schema: TableSchema,
    userEmail: string,
    userRole: string
  ): any[] {
    // If no row owner column configured, return all rows
    if (!schema.rowOwnerColumn) {
      return rows
    }

    const accessMode = schema.rowAccessMode || 'ALL'

    // ALL access mode - everyone sees everything
    if (accessMode === 'ALL') {
      return rows
    }

    // Admin override - admins see all rows in any mode
    if (userRole === 'ADMIN') {
      return rows
    }

    // OWNER_ONLY or OWNER_AND_ADMINS - filter by owner
    return rows.filter(row => {
      const ownerValue = row[schema.rowOwnerColumn!]
      
      // Empty owner - only admins can see (handled above)
      if (!ownerValue) {
        return false
      }

      // Check if current user is the owner
      // Support email match or user ID match
      return ownerValue === userEmail || 
             ownerValue.toLowerCase() === userEmail.toLowerCase()
    })
  }

  /**
   * Check if user can access/modify a specific row
   */
  static canUserAccessRow(
    row: any,
    schema: TableSchema,
    userEmail: string,
    userRole: string
  ): boolean {
    // If no row owner column configured, allow access
    if (!schema.rowOwnerColumn) {
      return true
    }

    const accessMode = schema.rowAccessMode || 'ALL'

    // ALL access mode - everyone can access
    if (accessMode === 'ALL') {
      return true
    }

    // Admin override
    if (userRole === 'ADMIN') {
      return true
    }

    // Check ownership
    const ownerValue = row[schema.rowOwnerColumn]
    if (!ownerValue) {
      return false // Unassigned rows only accessible to admins
    }

    return ownerValue === userEmail || 
           ownerValue.toLowerCase() === userEmail.toLowerCase()
  }

  /**
   * Get statistics about row ownership
   */
  static getRowOwnershipStats(
    rows: any[],
    schema: TableSchema
  ): { total: number; assigned: number; unassigned: number; byOwner: Record<string, number> } {
    const stats = {
      total: rows.length,
      assigned: 0,
      unassigned: 0,
      byOwner: {} as Record<string, number>
    }

    if (!schema.rowOwnerColumn) {
      return { ...stats, assigned: rows.length }
    }

    rows.forEach(row => {
      const owner = row[schema.rowOwnerColumn!]
      if (!owner) {
        stats.unassigned++
      } else {
        stats.assigned++
        stats.byOwner[owner] = (stats.byOwner[owner] || 0) + 1
      }
    })

    return stats
  }

  /**
   * Get verification progress for a table task
   */
  static getVerificationProgress(
    rows: any[],
    schema: TableSchema
  ): { totalRows: number; verifiedRows: number; percentComplete: number; statusColumn?: string } | null {
    // Find status column
    const statusColumn = schema.columns.find(
      c => c.type === 'status' && c.editPolicy === 'EDITABLE_COLLAB'
    )

    if (!statusColumn || rows.length === 0) {
      return null
    }

    const verifiedRows = rows.filter(r => r[statusColumn.id] === 'VERIFIED').length

    return {
      totalRows: rows.length,
      verifiedRows,
      percentComplete: Math.round((verifiedRows / rows.length) * 100),
      statusColumn: statusColumn.id
    }
  }

  /**
   * Check if completion is allowed based on completion rule
   */
  static canCompleteTask(
    rows: any[],
    schema: TableSchema,
    datasetSignoff: any | null
  ): { canComplete: boolean; reason: string | null } {
    const completionRule = schema.completionRule || 'NO_REQUIREMENT'

    if (completionRule === 'NO_REQUIREMENT') {
      return { canComplete: true, reason: null }
    }

    if (completionRule === 'DATASET_SIGNOFF') {
      if (!datasetSignoff) {
        return { canComplete: false, reason: 'Dataset sign-off required before completion' }
      }
      return { canComplete: true, reason: null }
    }

    if (completionRule === 'ALL_ROWS_VERIFIED') {
      const progress = this.getVerificationProgress(rows, schema)
      if (!progress) {
        return { canComplete: true, reason: null } // No status column, allow completion
      }
      if (progress.verifiedRows < progress.totalRows) {
        return { 
          canComplete: false, 
          reason: `All rows must be verified (${progress.verifiedRows}/${progress.totalRows} verified)` 
        }
      }
      return { canComplete: true, reason: null }
    }

    return { canComplete: true, reason: null }
  }

  /**
   * Batch verify rows (mark multiple rows as verified)
   */
  static async batchVerifyRows(
    taskInstanceId: string,
    organizationId: string,
    identityValues: any[],
    statusColumnId: string
  ) {
    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { lineage: true }
    })

    if (!instance || instance.isSnapshot) {
      throw new Error("Invalid instance or snapshot is read-only")
    }

    const schema = instance.lineage?.config as any as TableSchema
    const column = schema.columns.find(c => c.id === statusColumnId)

    if (!column || column.editPolicy !== 'EDITABLE_COLLAB') {
      throw new Error("Status column is not editable")
    }

    const rows = (instance.structuredData as any[]) || []
    let updatedCount = 0

    rows.forEach(row => {
      const idValue = row[schema.identityKey]
      if (identityValues.includes(idValue)) {
        row[statusColumnId] = 'VERIFIED'
        updatedCount++
      }
    })

    await prisma.taskInstance.update({
      where: { id: taskInstanceId },
      data: { structuredData: rows as any }
    })

    return { updatedCount }
  }
}
