/**
 * Database Columns API - Lightweight column schema endpoint
 *
 * GET /api/databases/[id]/columns - Get column schema without loading rows
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canPerformAction(session.user.role, "databases:view_databases", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const database = await prisma.database.findFirst({
      where: {
        id: params.id,
        organizationId: session.user.organizationId,
      },
      select: {
        id: true,
        name: true,
        schema: true,
      },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const schema = database.schema as { columns?: Array<{ key: string; label: string; dataType: string; required: boolean; order: number }> } | null
    const columns = schema?.columns || []

    return NextResponse.json({ columns, databaseName: database.name })
  } catch (error) {
    console.error("Error fetching database columns:", error)
    return NextResponse.json({ error: "Failed to fetch database columns" }, { status: 500 })
  }
}
