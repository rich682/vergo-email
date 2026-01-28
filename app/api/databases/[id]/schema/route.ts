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
 * 
 * Blocked operations:
 * - Remove identifier column
 * - Change identifier key after data exists
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
  identifierKey?: string
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
        identifierKey: true,
        rowCount: true,
      },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const currentSchema = database.schema as DatabaseSchema
    const hasData = database.rowCount > 0

    const body: SchemaUpdateRequest = await request.json()

    // ============================================
    // Guardrails
    // ============================================

    // 1. Cannot change identifier key after data exists
    if (body.identifierKey && body.identifierKey !== database.identifierKey && hasData) {
      return NextResponse.json({
        error: "Cannot change identifier column after data has been imported. Delete all data first.",
        code: "IDENTIFIER_LOCKED",
      }, { status: 400 })
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

    // 3. Cannot remove identifier column ever
    const newIdentifierKey = body.identifierKey || database.identifierKey
    if (body.columns) {
      const hasIdentifier = body.columns.some(c => c.key === newIdentifierKey)
      if (!hasIdentifier) {
        return NextResponse.json({
          error: "Cannot remove the identifier column from schema",
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
    const validationError = validateSchema(newSchema, newIdentifierKey)
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
        identifierKey: newIdentifierKey,
      },
      select: {
        id: true,
        schema: true,
        identifierKey: true,
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
