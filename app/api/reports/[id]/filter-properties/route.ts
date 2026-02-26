/**
 * Report Filter Properties API
 * 
 * GET /api/reports/[id]/filter-properties - Get filterable columns and their unique values
 * 
 * Returns columns explicitly configured as filterable in the report definition,
 * along with their unique values from the database.
 * 
 * If no filterColumnKeys are configured, returns empty (explicit opt-in model).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

interface RouteParams {
  params: Promise<{ id: string }>
}

// Maximum unique values to return per column (to avoid huge payloads)
const MAX_UNIQUE_VALUES = 500

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the report definition with its database
    const report = await prisma.reportDefinition.findFirst({
      where: { id, organizationId: session.user.organizationId },
      include: {
        database: {
          select: {
            id: true,
            name: true,
            schema: true,
            rows: true,
          },
        },
      },
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Check for ?all=true — returns all database columns (for report builder filter config)
    const url = new URL(request.url)
    const showAll = url.searchParams.get("all") === "true"

    if (showAll) {
      // Require reports:manage permission for all-columns mode
      if (!canPerformAction(session.user.role, "reports:manage", session.user.orgActionPermissions)) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }
    }

    // Get the configured filter column keys (explicit opt-in)
    const filterColumnKeys = (report as any).filterColumnKeys as string[] || []

    // If not showing all and no filter columns configured, return empty
    if (!showAll && filterColumnKeys.length === 0) {
      return NextResponse.json({ properties: [] })
    }

    // Parse the database schema
    const schemaData = report.database.schema as {
      columns: Array<{ key: string; label: string; dataType: string }>
      version?: number
    } | null

    const schema = schemaData?.columns || []

    if (schema.length === 0) {
      return NextResponse.json({ properties: [] })
    }

    const rows = (report.database.rows || []) as Array<Record<string, unknown>>

    // Build filter properties for configured columns (or all columns if showAll)
    const filterableProperties = []
    const columnsToProcess = showAll
      ? schema.filter(c => c.key !== (report as any).dateColumnKey).map(c => c.key)
      : filterColumnKeys

    for (const columnKey of columnsToProcess) {
      // Find the column in schema
      const column = schema.find(c => c.key === columnKey)
      if (!column) continue

      // Get unique values for this column
      const uniqueValues = new Set<string>()
      
      for (const row of rows) {
        const value = row[column.key]
        if (value !== null && value !== undefined && value !== "") {
          const strValue = String(value).trim()
          if (strValue) {
            uniqueValues.add(strValue)
          }
        }
        
        // Stop if we hit the limit
        if (uniqueValues.size >= MAX_UNIQUE_VALUES) {
          break
        }
      }

      // Skip columns with too few unique values (not useful for filtering)
      if (uniqueValues.size < 2) {
        continue
      }

      filterableProperties.push({
        key: column.key,
        label: column.label || column.key,
        values: Array.from(uniqueValues).sort((a, b) => a.localeCompare(b)),
      })
    }

    return NextResponse.json({ properties: filterableProperties })
  } catch (error) {
    console.error("Error fetching filter properties:", error)
    return NextResponse.json(
      { error: "Failed to fetch filter properties" },
      { status: 500 }
    )
  }
}
