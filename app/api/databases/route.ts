/**
 * Databases API - List and Create
 * 
 * GET /api/databases - List all databases for the organization
 * POST /api/databases - Create a new database with schema
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseService, DatabaseSchema, DatabaseRow } from "@/lib/services/database.service"
import { canWriteToModule } from "@/lib/permissions"

// GET - List databases
export async function GET(request: NextRequest) {
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

    const databases = await DatabaseService.listDatabases(user.organizationId)

    return NextResponse.json({ databases })
  } catch (error) {
    console.error("Error listing databases:", error)
    return NextResponse.json(
      { error: "Failed to list databases" },
      { status: 500 }
    )
  }
}

// POST - Create database
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    if (!canWriteToModule(session.user.role, "databases", session.user.orgRoleDefaults)) {
      return NextResponse.json({ error: "Read-only access" }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, schema, initialRows, sourceType, syncFilter } = body

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Database name is required" },
        { status: 400 }
      )
    }

    // Accounting-sourced database: sourceType provided, schema auto-populated
    if (sourceType && typeof sourceType === "string") {
      // Import source schemas to auto-populate
      const { SYNCED_DATABASE_SCHEMAS } = await import(
        "@/lib/services/accounting-sync.service"
      )

      // Find matching source definition by sourceType
      const sourceDef = Object.values(SYNCED_DATABASE_SCHEMAS).find(
        (def: any) => def.sourceType === sourceType
      ) as any

      if (!sourceDef) {
        return NextResponse.json(
          { error: `Unknown source type: ${sourceType}` },
          { status: 400 }
        )
      }

      const database = await prisma.database.create({
        data: {
          name: name.trim(),
          description: description?.trim() || sourceDef.description,
          organizationId: user.organizationId,
          schema: sourceDef.schema,
          identifierKeys: ["remote_id"],
          rows: [],
          rowCount: 0,
          sourceType,
          isReadOnly: true,
          syncFilter: syncFilter || null,
          createdById: user.id,
        },
        include: {
          createdBy: { select: { name: true, email: true } },
        },
      })

      return NextResponse.json({ database }, { status: 201 })
    }

    // Standard manual/upload database creation
    if (!schema || !schema.columns || !Array.isArray(schema.columns)) {
      return NextResponse.json(
        { error: "Valid schema with columns is required" },
        { status: 400 }
      )
    }

    // Create the database (identifierKeys no longer required)
    const database = await DatabaseService.createDatabase({
      name: name.trim(),
      description: description?.trim(),
      schema: schema as DatabaseSchema,
      organizationId: user.organizationId,
      createdById: user.id,
      initialRows: initialRows as DatabaseRow[] | undefined,
    })

    return NextResponse.json({ database }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating database:", error)
    return NextResponse.json(
      { error: "Failed to create database" },
      { status: 400 }
    )
  }
}
