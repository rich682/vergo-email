/**
 * Database Service
 * 
 * Business logic for the Databases feature - structured data management
 * with schema definitions and Excel import/export capabilities.
 * 
 * Key concepts:
 * - Composite identifiers: Multiple columns together form the unique key
 * - Append-only import: New rows are added, duplicates are rejected
 * - Reserved fields: Column keys starting with "_" are reserved for system use
 */

import { prisma } from "@/lib/prisma"

// ============================================
// Types
// ============================================

export interface DatabaseSchemaColumn {
  key: string
  label: string
  dataType: "text" | "number" | "date" | "boolean" | "currency" | "dropdown" | "file"
  required: boolean
  order: number
  dropdownOptions?: string[]  // Only for dropdown type - list of allowed values
}

export interface DatabaseSchema {
  columns: DatabaseSchemaColumn[]
  version: number
}

export interface DatabaseRow {
  [key: string]: string | number | boolean | null
}

export interface CreateDatabaseInput {
  name: string
  description?: string
  schema: DatabaseSchema
  identifierKeys?: string[]  // Deprecated - no longer used, kept for backwards compatibility
  organizationId: string
  createdById: string
  initialRows?: DatabaseRow[]
}

export interface UpdateDatabaseInput {
  name?: string
  description?: string
}

export interface ImportResult {
  added: number
  updated: number
  duplicates: number
  errors: string[]
}

export interface ColumnChange {
  columnKey: string
  columnLabel: string
  oldValue: unknown
  newValue: unknown
}

export interface UpdateCandidate {
  identifierValues: Record<string, unknown>
  changes: ColumnChange[]
  newRowData: DatabaseRow
  existingRowIndex: number
}

// ============================================
// Constants
// ============================================

export const MAX_ROWS = 10000
export const MAX_COLUMNS = 100

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a composite key string from a row using the identifier columns
 */
export function getCompositeKey(row: DatabaseRow, identifierKeys: string[]): string {
  return identifierKeys
    .map(key => String(row[key] ?? ""))
    .join("|||")  // Use a delimiter unlikely to appear in data
}

/**
 * Generate a full row key from ALL column values for exact duplicate detection
 */
export function getFullRowKey(row: DatabaseRow, schema: DatabaseSchema): string {
  return schema.columns
    .sort((a, b) => a.order - b.order)
    .map(col => {
      const value = row[col.key]
      // Normalize values for consistent comparison
      if (value === null || value === undefined) return ""
      if (typeof value === "number") return String(value)
      return String(value).trim()
    })
    .join("|||")
}

/**
 * Get the differences between two rows for the same identifier
 */
export function getRowDiff(
  existingRow: DatabaseRow,
  newRow: DatabaseRow,
  schema: DatabaseSchema,
  identifierKeys: string[]
): ColumnChange[] {
  const changes: ColumnChange[] = []
  
  for (const col of schema.columns) {
    // Skip identifier columns - they're the same by definition
    if (identifierKeys.includes(col.key)) continue
    
    const oldValue = existingRow[col.key]
    const newValue = newRow[col.key]
    
    // Normalize for comparison
    const normalizedOld = normalizeValue(oldValue)
    const normalizedNew = normalizeValue(newValue)
    
    if (normalizedOld !== normalizedNew) {
      changes.push({
        columnKey: col.key,
        columnLabel: col.label,
        oldValue,
        newValue,
      })
    }
  }
  
  return changes
}

/**
 * Normalize a value for comparison
 */
function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return String(value)
  return String(value).trim()
}

// ============================================
// Validation
// ============================================

export function validateSchema(schema: DatabaseSchema, _identifierKeys?: string[]): string | null {
  if (!schema.columns || schema.columns.length === 0) {
    return "Schema must have at least one column"
  }

  if (schema.columns.length > MAX_COLUMNS) {
    return `Schema cannot have more than ${MAX_COLUMNS} columns`
  }

  // Check for duplicate keys
  const keys = new Set<string>()
  for (const col of schema.columns) {
    if (keys.has(col.key)) {
      return `Duplicate column key: ${col.key}`
    }
    keys.add(col.key)
  }

  // Check for empty labels
  for (const col of schema.columns) {
    if (!col.label || col.label.trim() === "") {
      return `Column with key "${col.key}" must have a label`
    }
  }

  // Check for reserved field prefixes
  for (const col of schema.columns) {
    if (col.key.startsWith("_")) {
      return `Column key "${col.key}" cannot start with underscore (reserved for system use)`
    }
  }

  // Note: identifierKeys no longer required - uniqueness determined by all columns

  // Validate data types
  const validTypes = ["text", "number", "date", "boolean", "currency", "dropdown", "file"]
  for (const col of schema.columns) {
    if (!validTypes.includes(col.dataType)) {
      return `Invalid data type "${col.dataType}" for column "${col.label}"`
    }
    
    // Dropdown columns must have at least one option
    if (col.dataType === "dropdown") {
      if (!col.dropdownOptions || col.dropdownOptions.length === 0) {
        return `Dropdown column "${col.label}" must have at least one option`
      }
      // Validate options are non-empty strings
      for (const option of col.dropdownOptions) {
        if (!option || option.trim() === "") {
          return `Dropdown column "${col.label}" has empty options`
        }
      }
    }
  }

  return null
}

export function validateRows(
  rows: DatabaseRow[],
  schema: DatabaseSchema,
  _identifierKeys: string[]  // No longer used for within-batch duplicate detection
): { valid: boolean; errors: string[]; validRows: DatabaseRow[]; invalidRowIndices: number[] } {
  const errors: string[] = []
  const validRows: DatabaseRow[] = []
  const invalidRowIndices: number[] = []

  if (rows.length > MAX_ROWS) {
    errors.push(`Cannot import more than ${MAX_ROWS.toLocaleString()} rows`)
    return { valid: false, errors, validRows: [], invalidRowIndices: [] }
  }

  // Use ALL columns for within-batch duplicate detection
  const fullRowKeys = new Set<string>()
  const requiredColumns = schema.columns.filter(c => c.required)

  rows.forEach((row, index) => {
    const rowNum = index + 1
    let rowHasError = false

    // Check required fields
    for (const col of requiredColumns) {
      const value = row[col.key]
      if (value === null || value === undefined || value === "") {
        errors.push(`Row ${rowNum}: Required field "${col.label}" is empty`)
        rowHasError = true
      }
    }

    // Check ALL-COLUMN uniqueness within import batch
    const fullKey = getFullRowKey(row, schema)
    if (fullRowKeys.has(fullKey)) {
      errors.push(`Row ${rowNum}: Exact duplicate of another row in this file`)
      rowHasError = true
    }
    fullRowKeys.add(fullKey)

    if (rowHasError) {
      invalidRowIndices.push(index)
    } else {
      validRows.push(row)
    }
  })

  return { valid: errors.length === 0, errors, validRows, invalidRowIndices }
}

/**
 * Validate rows against existing database data
 * Uses ALL columns to determine uniqueness:
 * - Exact duplicate (all columns match) → skip
 * - Any column differs → new row (add it)
 * 
 * Note: Update candidates are no longer automatically detected.
 * Each unique combination of data is treated as a separate row.
 */
export function validateRowsAgainstExisting(
  newRows: DatabaseRow[],
  existingRows: DatabaseRow[],
  _identifierKeys: string[],  // Kept for API compatibility but not used
  schema: DatabaseSchema
): {
  newRows: DatabaseRow[]
  exactDuplicates: DatabaseRow[]
  updateCandidates: UpdateCandidate[]  // Always empty now - kept for API compatibility
} {
  // Build set of existing full row keys (ALL columns)
  const existingFullKeys = new Set<string>()
  
  existingRows.forEach((row) => {
    const fullKey = getFullRowKey(row, schema)
    existingFullKeys.add(fullKey)
  })

  const validNewRows: DatabaseRow[] = []
  const exactDuplicates: DatabaseRow[] = []

  for (const row of newRows) {
    const fullKey = getFullRowKey(row, schema)
    
    // Check if ALL columns match (exact duplicate)
    if (existingFullKeys.has(fullKey)) {
      exactDuplicates.push(row)
      continue
    }
    
    // Any difference in any column = new row
    validNewRows.push(row)
  }

  // No update candidates - all non-duplicates are new rows
  return { newRows: validNewRows, exactDuplicates, updateCandidates: [] }
}

// ============================================
// Service Functions
// ============================================

export class DatabaseService {
  /**
   * List all databases for an organization
   */
  static async listDatabases(organizationId: string) {
    const databases = await prisma.database.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        rowCount: true,
        schema: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return databases.map(db => ({
      ...db,
      columnCount: (db.schema as DatabaseSchema).columns.length,
    }))
  }

  /**
   * Get a single database by ID
   */
  static async getDatabase(id: string, organizationId: string) {
    const database = await prisma.database.findFirst({
      where: { id, organizationId },
      include: {
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
        lastImportedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        // Include report definitions to check for generated reports
        reportDefinitions: {
          select: {
            id: true,
            _count: {
              select: {
                generatedReports: true,
              },
            },
          },
        },
      },
    })

    if (!database) return null

    // Check if any reports using this database have generated reports
    const hasGeneratedReports = database.reportDefinitions.some(
      (rd: any) => rd._count.generatedReports > 0
    )

    // Return database with the hasGeneratedReports flag
    const { reportDefinitions, ...databaseWithoutReports } = database
    return {
      ...databaseWithoutReports,
      hasGeneratedReports,
    }
  }

  /**
   * Create a new database
   */
  static async createDatabase(input: CreateDatabaseInput) {
    // Validate schema (identifierKeys no longer required)
    const validationError = validateSchema(input.schema)
    if (validationError) {
      throw new Error(validationError)
    }

    // Validate initial rows if provided
    let rows: DatabaseRow[] = []
    let rowCount = 0

    if (input.initialRows && input.initialRows.length > 0) {
      const rowValidation = validateRows(input.initialRows, input.schema, [])
      if (!rowValidation.valid) {
        throw new Error(rowValidation.errors.join("; "))
      }
      rows = input.initialRows
      rowCount = rows.length
    }

    const database = await prisma.database.create({
      data: {
        name: input.name,
        description: input.description,
        organizationId: input.organizationId,
        schema: input.schema as any,
        identifierKeys: input.identifierKeys || [],  // Default to empty array
        rows: rows as any,
        rowCount,
        createdById: input.createdById,
        lastImportedAt: rowCount > 0 ? new Date() : null,
        lastImportedById: rowCount > 0 ? input.createdById : null,
      },
      include: {
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return database
  }

  /**
   * Update database metadata (name, description)
   */
  static async updateDatabase(id: string, organizationId: string, input: UpdateDatabaseInput) {
    const database = await prisma.database.updateMany({
      where: { id, organizationId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
      },
    })

    if (database.count === 0) {
      throw new Error("Database not found")
    }

    return prisma.database.findUnique({ where: { id } })
  }

  /**
   * Delete a database
   */
  static async deleteDatabase(id: string, organizationId: string) {
    const result = await prisma.database.deleteMany({
      where: { id, organizationId },
    })

    if (result.count === 0) {
      throw new Error("Database not found")
    }

    return { deleted: true }
  }

  /**
   * Import rows into a database with optional update support
   * - Rows with validation errors are skipped (partial import)
   * - Exact duplicates (all columns match) are silently skipped
   * - Update candidates (identifier match, data differs) are updated if updateExisting=true
   * - New rows are added
   */
  static async importRows(
    id: string,
    organizationId: string,
    userId: string,
    rows: DatabaseRow[],
    options: { updateExisting?: boolean } = {}
  ): Promise<ImportResult> {
    const { updateExisting = false } = options

    // Get the database and its schema
    const database = await prisma.database.findFirst({
      where: { id, organizationId },
    })

    if (!database) {
      throw new Error("Database not found")
    }

    const schema = database.schema as DatabaseSchema
    const identifierKeys = database.identifierKeys as string[]
    const existingRows = database.rows as DatabaseRow[]

    // Validate rows within import batch - now supports partial import
    const validation = validateRows(rows, schema, identifierKeys)
    
    // If ALL rows have errors, return the errors
    if (validation.validRows.length === 0) {
      return {
        added: 0,
        updated: 0,
        duplicates: 0,
        errors: validation.errors,
      }
    }

    // Check VALID rows against existing data (partial import)
    const { newRows, exactDuplicates, updateCandidates } = validateRowsAgainstExisting(
      validation.validRows,  // Only process rows that passed validation
      existingRows,
      identifierKeys,
      schema
    )

    // Check if adding new rows would exceed limit
    const totalAfterImport = existingRows.length + newRows.length
    if (totalAfterImport > MAX_ROWS) {
      return {
        added: 0,
        updated: 0,
        duplicates: exactDuplicates.length,
        errors: [
          `Cannot add ${newRows.length} rows. Database has ${existingRows.length} rows and limit is ${MAX_ROWS.toLocaleString()}.`
        ],
      }
    }

    // Build the final rows array
    let finalRows = [...existingRows]
    let updatedCount = 0

    // Handle updates if requested
    if (updateExisting && updateCandidates.length > 0) {
      for (const candidate of updateCandidates) {
        finalRows[candidate.existingRowIndex] = candidate.newRowData
        updatedCount++
      }
    }

    // Append new rows
    finalRows = [...finalRows, ...newRows]

    // No changes to make
    if (newRows.length === 0 && updatedCount === 0) {
      return {
        added: 0,
        updated: 0,
        duplicates: exactDuplicates.length,
        errors: exactDuplicates.length > 0 ? [] : ["No new rows to import"],
      }
    }

    // Update database with combined rows
    await prisma.database.update({
      where: { id },
      data: {
        rows: finalRows as any,
        rowCount: finalRows.length,
        lastImportedAt: new Date(),
        lastImportedById: userId,
      },
    })

    return {
      added: newRows.length,
      updated: updatedCount,
      duplicates: exactDuplicates.length,
      errors: [],
    }
  }

  /**
   * Preview import (validation, duplicate detection, and update candidates)
   * Supports partial imports - valid rows can be imported even if some rows have errors
   */
  static async previewImport(
    id: string,
    organizationId: string,
    rows: DatabaseRow[]
  ) {
    // Get the database and its schema
    const database = await prisma.database.findFirst({
      where: { id, organizationId },
    })

    if (!database) {
      throw new Error("Database not found")
    }

    const schema = database.schema as DatabaseSchema
    const identifierKeys = database.identifierKeys as string[]
    const existingRows = database.rows as DatabaseRow[]

    // Validate rows within import batch - now returns validRows for partial import
    const validation = validateRows(rows, schema, identifierKeys)

    // Check VALID rows against existing data (not all rows)
    const { newRows, exactDuplicates, updateCandidates } = validateRowsAgainstExisting(
      validation.validRows,  // Only process rows that passed validation
      existingRows,
      identifierKeys,
      schema
    )

    // Check row limit
    const totalAfterImport = existingRows.length + newRows.length
    const wouldExceedLimit = totalAfterImport > MAX_ROWS

    // Collect validation errors as warnings (since we support partial import)
    const warnings: string[] = []
    
    // Add validation errors as warnings (rows will be skipped, not blocking)
    if (validation.errors.length > 0) {
      warnings.push(`${validation.invalidRowIndices.length} row(s) have errors and will be skipped:`)
      // Show first few errors
      const maxErrorsToShow = 5
      validation.errors.slice(0, maxErrorsToShow).forEach(err => {
        warnings.push(`  • ${err}`)
      })
      if (validation.errors.length > maxErrorsToShow) {
        warnings.push(`  • ...and ${validation.errors.length - maxErrorsToShow} more`)
      }
    }
    
    // Add exact duplicate info
    if (exactDuplicates.length > 0) {
      warnings.push(`${exactDuplicates.length} identical row(s) will be skipped (already exist)`)
    }

    // Blocking errors (things that prevent ANY import)
    const errors: string[] = []
    if (wouldExceedLimit) {
      errors.push(
        `Adding ${newRows.length} rows would exceed the ${MAX_ROWS.toLocaleString()} row limit ` +
        `(current: ${existingRows.length})`
      )
    }

    // The preview is valid if:
    // - Not exceeding row limit
    // - There are new rows OR there are update candidates (even if some rows had validation errors)
    const hasContent = newRows.length > 0 || updateCandidates.length > 0
    const isValid = !wouldExceedLimit && hasContent

    return {
      valid: isValid,
      errors,  // Only blocking errors
      warnings,  // Validation errors + duplicate info (non-blocking)
      rowCount: rows.length,
      validRowCount: validation.validRows.length,  // NEW: rows that passed validation
      invalidRowCount: validation.invalidRowIndices.length,  // NEW: rows with errors
      newRowCount: newRows.length,
      exactDuplicateCount: exactDuplicates.length,
      updateCandidates,  // Include full update candidate data for UI to display diffs
      existingRowCount: database.rowCount,
      totalAfterImport: existingRows.length + newRows.length,
      identifierKeys,  // Include for UI display
      schema,  // Include for column labels in UI
    }
  }

  /**
   * Delete specific rows from a database by their composite keys
   */
  static async deleteRows(
    id: string,
    organizationId: string,
    userId: string,
    compositeKeys: string[][]  // Array of key arrays, e.g., [["proj-1", "jan"], ["proj-2", "jan"]]
  ) {
    const database = await prisma.database.findFirst({
      where: { id, organizationId },
    })

    if (!database) {
      throw new Error("Database not found")
    }

    const identifierKeys = database.identifierKeys as string[]
    const existingRows = database.rows as DatabaseRow[]

    // Build set of keys to delete
    const keysToDelete = new Set<string>()
    for (const keyValues of compositeKeys) {
      if (keyValues.length !== identifierKeys.length) {
        throw new Error(`Invalid key: expected ${identifierKeys.length} values, got ${keyValues.length}`)
      }
      // Create composite key string
      keysToDelete.add(keyValues.join("|||"))
    }

    // Filter out rows that match the keys to delete
    const remainingRows = existingRows.filter(row => {
      const rowKey = getCompositeKey(row, identifierKeys)
      return !keysToDelete.has(rowKey)
    })

    const deletedCount = existingRows.length - remainingRows.length

    if (deletedCount === 0) {
      return { deleted: 0 }
    }

    // Update database
    await prisma.database.update({
      where: { id },
      data: {
        rows: remainingRows as any,
        rowCount: remainingRows.length,
        updatedAt: new Date(),
      },
    })

    return { deleted: deletedCount }
  }
}
