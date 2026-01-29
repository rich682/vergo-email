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
  dataType: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
  order: number
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
  identifierKeys: string[]  // Composite key - multiple columns form unique identifier
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
  duplicates: number
  errors: string[]
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

// ============================================
// Validation
// ============================================

export function validateSchema(schema: DatabaseSchema, identifierKeys: string[]): string | null {
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

  // Validate identifier keys
  if (!identifierKeys || identifierKeys.length === 0) {
    return "At least one identifier column must be specified"
  }

  // Check all identifier columns exist and are required
  for (const idKey of identifierKeys) {
    const identifierColumn = schema.columns.find(c => c.key === idKey)
    if (!identifierColumn) {
      return `Identifier column "${idKey}" not found in schema`
    }
    if (!identifierColumn.required) {
      return `Identifier column "${identifierColumn.label}" must be marked as required`
    }
  }

  // Validate data types
  const validTypes = ["text", "number", "date", "boolean", "currency"]
  for (const col of schema.columns) {
    if (!validTypes.includes(col.dataType)) {
      return `Invalid data type "${col.dataType}" for column "${col.label}"`
    }
  }

  return null
}

export function validateRows(
  rows: DatabaseRow[],
  schema: DatabaseSchema,
  identifierKeys: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (rows.length > MAX_ROWS) {
    errors.push(`Cannot import more than ${MAX_ROWS.toLocaleString()} rows`)
    return { valid: false, errors }
  }

  const compositeKeyValues = new Set<string>()
  const requiredColumns = schema.columns.filter(c => c.required)

  rows.forEach((row, index) => {
    const rowNum = index + 1

    // Check required fields
    for (const col of requiredColumns) {
      const value = row[col.key]
      if (value === null || value === undefined || value === "") {
        errors.push(`Row ${rowNum}: Required field "${col.label}" is empty`)
      }
    }

    // Check composite key uniqueness within import batch
    const compositeKey = getCompositeKey(row, identifierKeys)
    if (compositeKeyValues.has(compositeKey)) {
      const keyDescription = identifierKeys.length === 1 
        ? `"${row[identifierKeys[0]]}"` 
        : identifierKeys.map(k => `${k}="${row[k]}"`).join(", ")
      errors.push(`Row ${rowNum}: Duplicate identifier (${keyDescription})`)
    }
    compositeKeyValues.add(compositeKey)
  })

  return { valid: errors.length === 0, errors }
}

/**
 * Validate rows against existing database data (for append-only import)
 * Returns which rows are new vs duplicates
 */
export function validateRowsAgainstExisting(
  newRows: DatabaseRow[],
  existingRows: DatabaseRow[],
  identifierKeys: string[]
): { newRows: DatabaseRow[]; duplicateRows: DatabaseRow[]; duplicateKeys: string[] } {
  // Build set of existing composite keys
  const existingKeys = new Set<string>()
  for (const row of existingRows) {
    existingKeys.add(getCompositeKey(row, identifierKeys))
  }

  const validNewRows: DatabaseRow[] = []
  const duplicateRows: DatabaseRow[] = []
  const duplicateKeys: string[] = []

  for (const row of newRows) {
    const compositeKey = getCompositeKey(row, identifierKeys)
    if (existingKeys.has(compositeKey)) {
      duplicateRows.push(row)
      // Create human-readable key description
      const keyDescription = identifierKeys.length === 1 
        ? String(row[identifierKeys[0]]) 
        : identifierKeys.map(k => `${k}="${row[k]}"`).join(", ")
      duplicateKeys.push(keyDescription)
    } else {
      validNewRows.push(row)
    }
  }

  return { newRows: validNewRows, duplicateRows, duplicateKeys }
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
    // Validate schema
    const validationError = validateSchema(input.schema, input.identifierKeys)
    if (validationError) {
      throw new Error(validationError)
    }

    // Validate initial rows if provided
    let rows: DatabaseRow[] = []
    let rowCount = 0

    if (input.initialRows && input.initialRows.length > 0) {
      const rowValidation = validateRows(input.initialRows, input.schema, input.identifierKeys)
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
        identifierKeys: input.identifierKeys,
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
   * Import rows into a database (append-only - adds new rows, rejects duplicates)
   */
  static async importRows(
    id: string,
    organizationId: string,
    userId: string,
    rows: DatabaseRow[]
  ): Promise<ImportResult> {
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

    // Validate rows within import batch
    const validation = validateRows(rows, schema, identifierKeys)
    if (!validation.valid) {
      return {
        added: 0,
        duplicates: 0,
        errors: validation.errors,
      }
    }

    // Check against existing data
    const { newRows, duplicateRows, duplicateKeys } = validateRowsAgainstExisting(
      rows,
      existingRows,
      identifierKeys
    )

    // Check if adding new rows would exceed limit
    const totalAfterImport = existingRows.length + newRows.length
    if (totalAfterImport > MAX_ROWS) {
      return {
        added: 0,
        duplicates: duplicateRows.length,
        errors: [
          `Cannot add ${newRows.length} rows. Database has ${existingRows.length} rows and limit is ${MAX_ROWS.toLocaleString()}.`
        ],
      }
    }

    // If there are duplicates, return error (user probably made a mistake)
    if (duplicateRows.length > 0) {
      const maxDuplicatesToShow = 5
      const duplicateErrors = duplicateKeys.slice(0, maxDuplicatesToShow).map(
        key => `Duplicate: ${key}`
      )
      if (duplicateKeys.length > maxDuplicatesToShow) {
        duplicateErrors.push(`...and ${duplicateKeys.length - maxDuplicatesToShow} more duplicates`)
      }

      return {
        added: 0,
        duplicates: duplicateRows.length,
        errors: [
          `${duplicateRows.length} row(s) already exist in the database:`,
          ...duplicateErrors,
        ],
      }
    }

    // No new rows to add
    if (newRows.length === 0) {
      return {
        added: 0,
        duplicates: 0,
        errors: ["No new rows to import"],
      }
    }

    // Append new rows to existing data
    const allRows = [...existingRows, ...newRows]

    // Update database with combined rows
    await prisma.database.update({
      where: { id },
      data: {
        rows: allRows as any,
        rowCount: allRows.length,
        lastImportedAt: new Date(),
        lastImportedById: userId,
      },
    })

    return {
      added: newRows.length,
      duplicates: 0,
      errors: [],
    }
  }

  /**
   * Preview import (validation and duplicate detection, no persistence)
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

    // Validate rows within import batch
    const validation = validateRows(rows, schema, identifierKeys)

    // Check against existing data
    const { newRows, duplicateRows, duplicateKeys } = validateRowsAgainstExisting(
      rows,
      existingRows,
      identifierKeys
    )

    // Check row limit
    const totalAfterImport = existingRows.length + newRows.length
    const wouldExceedLimit = totalAfterImport > MAX_ROWS

    // Collect all errors
    const errors = [...validation.errors]
    
    if (wouldExceedLimit) {
      errors.push(
        `Adding ${newRows.length} rows would exceed the ${MAX_ROWS.toLocaleString()} row limit ` +
        `(current: ${existingRows.length})`
      )
    }

    // Add duplicate warnings (first 5)
    const duplicateWarnings: string[] = []
    if (duplicateRows.length > 0) {
      const maxToShow = 5
      duplicateWarnings.push(`${duplicateRows.length} duplicate row(s) will be skipped:`)
      for (let i = 0; i < Math.min(duplicateKeys.length, maxToShow); i++) {
        duplicateWarnings.push(`  - ${duplicateKeys[i]}`)
      }
      if (duplicateKeys.length > maxToShow) {
        duplicateWarnings.push(`  - ...and ${duplicateKeys.length - maxToShow} more`)
      }
    }

    return {
      valid: validation.valid && !wouldExceedLimit && duplicateRows.length === 0,
      errors,
      warnings: duplicateWarnings,
      rowCount: rows.length,
      newRowCount: newRows.length,
      duplicateCount: duplicateRows.length,
      existingRowCount: database.rowCount,
      totalAfterImport: existingRows.length + newRows.length,
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
