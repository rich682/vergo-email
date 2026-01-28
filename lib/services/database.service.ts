/**
 * Database Service
 * 
 * Business logic for the Databases feature - structured data management
 * with schema definitions and Excel import/export capabilities.
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
  identifierKey: string
  organizationId: string
  createdById: string
  initialRows?: DatabaseRow[]
}

export interface UpdateDatabaseInput {
  name?: string
  description?: string
}

// ============================================
// Constants
// ============================================

export const MAX_ROWS = 10000
export const MAX_COLUMNS = 100

// ============================================
// Validation
// ============================================

export function validateSchema(schema: DatabaseSchema, identifierKey: string): string | null {
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

  // Check identifier column exists and is required
  const identifierColumn = schema.columns.find(c => c.key === identifierKey)
  if (!identifierColumn) {
    return `Identifier column "${identifierKey}" not found in schema`
  }

  if (!identifierColumn.required) {
    return "Identifier column must be marked as required"
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
  identifierKey: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (rows.length > MAX_ROWS) {
    errors.push(`Cannot import more than ${MAX_ROWS.toLocaleString()} rows`)
    return { valid: false, errors }
  }

  const identifierValues = new Set<string>()
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

    // Check identifier uniqueness
    const identifierValue = row[identifierKey]
    if (identifierValue !== null && identifierValue !== undefined) {
      const stringValue = String(identifierValue)
      if (identifierValues.has(stringValue)) {
        errors.push(`Row ${rowNum}: Duplicate identifier value "${stringValue}"`)
      }
      identifierValues.add(stringValue)
    }
  })

  return { valid: errors.length === 0, errors }
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
      },
    })

    return database
  }

  /**
   * Create a new database
   */
  static async createDatabase(input: CreateDatabaseInput) {
    // Validate schema
    const validationError = validateSchema(input.schema, input.identifierKey)
    if (validationError) {
      throw new Error(validationError)
    }

    // Validate initial rows if provided
    let rows: DatabaseRow[] = []
    let rowCount = 0

    if (input.initialRows && input.initialRows.length > 0) {
      const rowValidation = validateRows(input.initialRows, input.schema, input.identifierKey)
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
        identifierKey: input.identifierKey,
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
   * Import rows into a database (replace all)
   */
  static async importRows(
    id: string,
    organizationId: string,
    userId: string,
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

    // Validate rows
    const validation = validateRows(rows, schema, database.identifierKey)
    if (!validation.valid) {
      throw new Error(validation.errors.join("; "))
    }

    // Update database with new rows (replace all)
    const updated = await prisma.database.update({
      where: { id },
      data: {
        rows: rows as any,
        rowCount: rows.length,
        lastImportedAt: new Date(),
        lastImportedById: userId,
      },
    })

    return updated
  }

  /**
   * Preview import (validation only, no persistence)
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

    // Validate rows
    const validation = validateRows(rows, schema, database.identifierKey)

    return {
      valid: validation.valid,
      errors: validation.errors,
      rowCount: rows.length,
      existingRowCount: database.rowCount,
    }
  }
}
