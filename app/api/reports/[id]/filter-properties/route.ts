/**
 * Report Filter Properties API
 * 
 * GET /api/reports/[id]/filter-properties - Get filterable columns and their unique values
 * 
 * Returns columns from the report's source database that are suitable for filtering
 * (typically text columns with reasonable cardinality), along with their unique values.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

// Maximum unique values to return per column (to avoid huge payloads)
const MAX_UNIQUE_VALUES = 500

// Data types suitable for filtering (includes all text-like types)
// Also allow any column where the actual values are strings/categorical
const FILTERABLE_DATA_TYPES = ["text", "status", "category", "enum", "string"]

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    
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

    // Get the report definition with its database
    const report = await prisma.reportDefinition.findFirst({
      where: { id, organizationId: user.organizationId },
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

    // Parse the database schema to find filterable columns
    // DatabaseSchema is an object with { columns: [...], version: number }
    const schemaData = report.database.schema as {
      columns: Array<{ key: string; label: string; dataType: string }>
      version?: number
    } | null

    const schema = schemaData?.columns || []

    if (schema.length === 0) {
      return NextResponse.json({ properties: [] })
    }

    const rows = (report.database.rows || []) as Array<Record<string, unknown>>

    // Find columns that are good candidates for filtering
    const filterableProperties = []

    for (const column of schema) {
      // Skip the date column used for period filtering
      if (column.key === report.dateColumnKey) {
        continue
      }

      // Get unique values for this column first (we'll use this to determine if it's filterable)
      const uniqueValues = new Set<string>()
      let hasNonNumericValues = false
      
      for (const row of rows) {
        const value = row[column.key]
        if (value !== null && value !== undefined && value !== "") {
          const strValue = String(value).trim()
          if (strValue) {
            uniqueValues.add(strValue)
            // Check if value looks like text (not a pure number)
            if (isNaN(Number(strValue)) || strValue.includes(" ") || strValue.includes(",")) {
              hasNonNumericValues = true
            }
          }
        }
        
        // Stop if we hit the limit
        if (uniqueValues.size >= MAX_UNIQUE_VALUES) {
          break
        }
      }

      // Skip columns with too few unique values (not useful for filtering)
      const valueCount = uniqueValues.size
      if (valueCount < 2) {
        continue
      }

      // Determine if column is filterable based on data type OR actual values
      const isFilterableType = FILTERABLE_DATA_TYPES.includes(column.dataType.toLowerCase())
      
      // Also allow any column where values look categorical (not pure numbers, reasonable cardinality)
      const looksCategorial = hasNonNumericValues && valueCount <= MAX_UNIQUE_VALUES
      
      // Skip if declared as number/currency AND values are all numeric (probably metrics, not categories)
      const isNumericType = ["number", "currency"].includes(column.dataType.toLowerCase())
      if (isNumericType && !hasNonNumericValues) {
        continue
      }

      // Skip if too many unique values relative to row count (probably IDs)
      // But be more permissive - allow up to 500 unique values if they look categorical
      if (valueCount > rows.length * 0.9 && valueCount > 100 && !isFilterableType) {
        continue
      }

      // Include if explicitly filterable type, or if values look categorical
      if (!isFilterableType && !looksCategorial) {
        continue
      }

      filterableProperties.push({
        key: column.key,
        label: column.label || column.key,
        values: Array.from(uniqueValues).sort((a, b) => a.localeCompare(b)),
      })
    }

    // Sort properties by label
    filterableProperties.sort((a, b) => a.label.localeCompare(b.label))

    return NextResponse.json({ properties: filterableProperties })
  } catch (error) {
    console.error("Error fetching filter properties:", error)
    return NextResponse.json(
      { error: "Failed to fetch filter properties" },
      { status: 500 }
    )
  }
}
