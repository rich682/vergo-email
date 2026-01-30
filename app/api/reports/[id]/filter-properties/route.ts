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

// Data types suitable for filtering
const FILTERABLE_DATA_TYPES = ["text", "status", "category", "enum"]

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
    const schema = report.database.schema as Array<{
      key: string
      label: string
      dataType: string
    }> | null

    if (!schema || schema.length === 0) {
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

      // Check if data type is filterable
      const isFilterableType = FILTERABLE_DATA_TYPES.includes(column.dataType.toLowerCase()) ||
        column.dataType.toLowerCase() === "string"

      if (!isFilterableType) {
        continue
      }

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

      // Skip columns with too few or too many unique values
      // (1 value = not useful for filtering, too many = probably not categorical)
      const valueCount = uniqueValues.size
      if (valueCount < 2) {
        continue
      }

      // Skip if every row has a unique value (probably an ID column)
      if (valueCount > rows.length * 0.8 && valueCount > 50) {
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
