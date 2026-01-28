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

    const database = await DatabaseService.getDatabase(params.id, user.organizationId)

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
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

    const body = await request.json()
    const { name, description } = body

    // Validate name if provided
    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      return NextResponse.json(
        { error: "Database name cannot be empty" },
        { status: 400 }
      )
    }

    const database = await DatabaseService.updateDatabase(
      params.id,
      user.organizationId,
      {
        name: name?.trim(),
        description: description?.trim(),
      }
    )

    return NextResponse.json({ database })
  } catch (error: any) {
    console.error("Error updating database:", error)
    
    if (error.message === "Database not found") {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to update database" },
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

    await DatabaseService.deleteDatabase(params.id, user.organizationId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting database:", error)
    
    if (error.message === "Database not found") {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to delete database" },
      { status: 500 }
    )
  }
}
