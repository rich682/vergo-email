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
import { canPerformAction } from "@/lib/permissions"

// GET - List databases
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "databases:view_databases", session.user.orgActionPermissions)) {
      return NextResponse.json({ databases: [] })
    }

    const databases = await DatabaseService.listDatabases(session.user.organizationId)

    // Users with view_all_databases see everything; others only see databases they created or are viewers of
    const canViewAll = canPerformAction(session.user.role, "databases:view_all_databases", session.user.orgActionPermissions)
    const filteredDatabases = canViewAll
      ? databases
      : await (async () => {
          const viewerEntries = await prisma.databaseViewer.findMany({
            where: { userId: session.user.id },
            select: { databaseId: true },
          })
          const viewableIds = new Set(viewerEntries.map((v) => v.databaseId))
          return databases.filter((d) => viewableIds.has(d.id) || d.createdById === session.user.id)
        })()

    return NextResponse.json({ databases: filteredDatabases })
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
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "databases:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage databases" }, { status: 403 })
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

    // Check for duplicate name within the organization
    const existingDb = await prisma.database.findFirst({
      where: { organizationId: session.user.organizationId, name: name.trim() },
      select: { id: true },
    })
    if (existingDb) {
      return NextResponse.json(
        { error: `A database with the name "${name.trim()}" already exists` },
        { status: 409 }
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
          organizationId: session.user.organizationId,
          schema: sourceDef.schema,
          identifierKeys: ["remote_id"],
          rows: [],
          rowCount: 0,
          sourceType,
          isReadOnly: true,
          syncFilter: syncFilter || null,
          createdById: session.user.id,
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
      organizationId: session.user.organizationId,
      createdById: session.user.id,
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
