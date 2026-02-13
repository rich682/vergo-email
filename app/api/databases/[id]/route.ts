/**
 * Database Detail API - Get, Update, Delete
 * 
 * GET /api/databases/[id] - Get database with schema and rows
 * PATCH /api/databases/[id] - Update database name/description
 * DELETE /api/databases/[id] - Delete database
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseService } from "@/lib/services/database.service"
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: { id: string }
}

// GET - Get database detail
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    if (!canPerformAction(session.user.role, "databases:view_databases", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to view databases" }, { status: 403 })
    }

    const database = await DatabaseService.getDatabase(params.id, user.organizationId)

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    // Users with view_all_databases bypass viewer check; creators also bypass
    const canViewAll = canPerformAction(session.user.role, "databases:view_all_databases", session.user.orgActionPermissions)
    if (!canViewAll) {
      if (database.createdById !== session.user.id) {
        const isViewer = await DatabaseService.isViewer(params.id, session.user.id)
        if (!isViewer) {
          return NextResponse.json(
            { error: "You do not have viewer access to this database" },
            { status: 403 }
          )
        }
      }
    }

    return NextResponse.json({ database })
  } catch (error) {
    console.error("Error getting database:", error)
    return NextResponse.json(
      { error: "Failed to get database" },
      { status: 500 }
    )
  }
}

// PATCH - Update database metadata
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

    if (!canPerformAction(session.user.role, "databases:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage databases" }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, syncFilter } = body

    // Validate name if provided
    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      return NextResponse.json(
        { error: "Database name cannot be empty" },
        { status: 400 }
      )
    }

    // Validate syncFilter if provided
    if (syncFilter !== undefined && syncFilter !== null) {
      if (!Array.isArray(syncFilter)) {
        return NextResponse.json(
          { error: "syncFilter must be an array" },
          { status: 400 }
        )
      }
      for (const f of syncFilter) {
        if (!f.column || !f.value || typeof f.column !== "string" || typeof f.value !== "string") {
          return NextResponse.json(
            { error: "Each filter must have column and value strings" },
            { status: 400 }
          )
        }
      }
    }

    // Check if filters are changing on an accounting-sourced database
    let filtersChanged = false
    if (syncFilter !== undefined) {
      const existingDb = await DatabaseService.getDatabase(params.id, user.organizationId)
      if (existingDb?.sourceType) {
        const oldFilter = JSON.stringify(existingDb.syncFilter || null)
        const newFilter = JSON.stringify(syncFilter)
        filtersChanged = oldFilter !== newFilter
      }
    }

    const database = await DatabaseService.updateDatabase(
      params.id,
      user.organizationId,
      {
        name: name?.trim(),
        description: description?.trim(),
        ...(syncFilter !== undefined && { syncFilter: syncFilter || null }),
      }
    )

    // Clear rows if filters changed — old data was synced with different filters
    if (filtersChanged) {
      await DatabaseService.clearDatabaseRows(params.id, user.organizationId)
    }

    return NextResponse.json({ database, filtersChanged })
  } catch (error: any) {
    console.error("Error updating database:", error)
    
    if (error.message === "Database not found") {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to update database" },
      { status: 400 }
    )
  }
}

// DELETE - Delete database
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    if (!canPerformAction(session.user.role, "databases:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage databases" }, { status: 403 })
    }

    await DatabaseService.deleteDatabase(params.id, user.organizationId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting database:", error)
    
    if (error.message === "Database not found") {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: "Failed to delete database" },
      { status: 500 }
    )
  }
}
