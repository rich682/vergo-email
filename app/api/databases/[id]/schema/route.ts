/**
 * Database Schema Edit API
 * 
 * PATCH /api/databases/[id]/schema - Update schema with guardrails
 * 
 * Allowed operations:
 * - Add new columns
 * - Rename column labels
 * - Change column order
 * - Change data types (with warnings)
 * - Mark columns as required/optional (with warnings)
 * - Add identifier columns (if not yet has data)
 * 
 * Blocked operations:
 * - Remove identifier columns
 * - Change identifier keys after data exists
 * - Remove columns if data exists (v1 restriction)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseSchema, DatabaseSchemaColumn, validateSchema } from "@/lib/services/database.service"

interface RouteParams {
  params: { id: string }
}

interface SchemaUpdateRequest {
  columns?: DatabaseSchemaColumn[]
  identifierKeys?: string[]
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Get the database
    const database = await prisma.database.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        schema: true,
        identifierKeys: true,
        rowCount: true,
      },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const currentSchema = database.schema as DatabaseSchema
    const currentIdentifierKeys = database.identifierKeys as string[]
    const hasData = database.rowCount > 0

    const body: SchemaUpdateRequest = await request.json()

    // ============================================
    // Guardrails
    // ============================================

    // 1. Cannot change identifier keys after data exists
    if (body.identifierKeys && hasData) {
      const currentKeySet = new Set(currentIdentifierKeys)
      const newKeySet = new Set(body.identifierKeys)
      
      const keysMatch = 
        currentKeySet.size === newKeySet.size &&
        [...currentKeySet].every(k => newKeySet.has(k))
      
      if (!keysMatch) {
        return NextResponse.json({
          error: "Cannot change identifier columns after data has been imported. Delete all data first.",
          code: "IDENTIFIER_LOCKED",
        }, { status: 400 })
      }
    }

    // 2. Cannot remove columns if data exists (v1 restriction)
    if (body.columns && hasData) {
      const currentKeys = new Set(currentSchema.columns.map(c => c.key))
      const newKeys = new Set(body.columns.map(c => c.key))
      
      const removedKeys = [...currentKeys].filter(k => !newKeys.has(k))
      if (removedKeys.length > 0) {
        const removedLabels = currentSchema.columns
          .filter(c => removedKeys.includes(c.key))
          .map(c => c.label)
        
        return NextResponse.json({
          error: `Cannot remove columns when data exists. Columns that would be removed: ${removedLabels.join(", ")}`,
          code: "COLUMNS_LOCKED",
        }, { status: 400 })
      }
    }

    // 3. Cannot remove identifier columns ever
    const newIdentifierKeys = body.identifierKeys || currentIdentifierKeys
    if (body.columns) {
      const newColumnKeys = new Set(body.columns.map(c => c.key))
      const missingIdentifiers = newIdentifierKeys.filter(k => !newColumnKeys.has(k))
      
      if (missingIdentifiers.length > 0) {
        return NextResponse.json({
          error: `Cannot remove identifier columns from schema: ${missingIdentifiers.join(", ")}`,
          code: "IDENTIFIER_REQUIRED",
        }, { status: 400 })
      }
    }

    // ============================================
    // Construct new schema
    // ============================================

    const newSchema: DatabaseSchema = {
      columns: body.columns || currentSchema.columns,
      version: currentSchema.version + 1,
    }

    // Validate the new schema
    const validationError = validateSchema(newSchema, newIdentifierKeys)
    if (validationError) {
      return NextResponse.json({
        error: validationError,
        code: "VALIDATION_ERROR",
      }, { status: 400 })
    }

    // ============================================
    // Generate warnings (non-blocking)
    // ============================================

    const warnings: string[] = []

    if (body.columns && hasData) {
      // Check for data type changes
      for (const newCol of body.columns) {
        const oldCol = currentSchema.columns.find(c => c.key === newCol.key)
        if (oldCol && oldCol.dataType !== newCol.dataType) {
          warnings.push(`Changing data type of "${newCol.label}" from ${oldCol.dataType} to ${newCol.dataType}. Existing data will not be converted.`)
        }
        
        // Check for required flag changes (from optional to required)
        if (oldCol && !oldCol.required && newCol.required) {
          warnings.push(`Marking "${newCol.label}" as required. Existing rows with empty values may fail validation on re-import.`)
        }
      }
    }

    // ============================================
    // Apply update
    // ============================================

    const updated = await prisma.database.update({
      where: { id: params.id },
      data: {
        schema: newSchema as any,
        identifierKeys: newIdentifierKeys,
      },
      select: {
        id: true,
        schema: true,
        identifierKeys: true,
      },
    })

    return NextResponse.json({
      database: updated,
      warnings,
    })
  } catch (error) {
    console.error("Error updating schema:", error)
    return NextResponse.json(
      { error: "Failed to update schema" },
      { status: 500 }
    )
  }
}
