import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Default column configuration for boards list
const DEFAULT_BOARD_COLUMNS = [
  { id: "name", label: "Item", width: 280, visible: true, order: 0, isSystem: true },
  { id: "cadence", label: "Cadence", width: 100, visible: true, order: 1, isSystem: true },
  { id: "period", label: "Period", width: 140, visible: true, order: 2, isSystem: true },
  { id: "status", label: "Status", width: 120, visible: true, order: 3, isSystem: true },
  { id: "owner", label: "Person", width: 140, visible: true, order: 4, isSystem: true },
  { id: "updatedAt", label: "Date", width: 120, visible: true, order: 5, isSystem: true },
]

// Merge saved config with default columns to include any new system columns
function mergeWithDefaults(savedColumns: any[]): any[] {
  const savedIds = new Set(savedColumns.map(c => c.id))
  const maxOrder = Math.max(...savedColumns.map(c => c.order), -1)
  
  // Find any default system columns that are missing from saved config
  const missingColumns = DEFAULT_BOARD_COLUMNS.filter(
    dc => dc.isSystem && !savedIds.has(dc.id)
  ).map((col, index) => ({
    ...col,
    order: maxOrder + 1 + index // Add at the end
  }))
  
  return [...savedColumns, ...missingColumns]
}

// GET - Fetch board column configuration for the organization
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true }
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Get org features which may contain boardColumns config
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { features: true }
    })

    const features = (org?.features as Record<string, any>) || {}
    
    if (features.boardColumns && Array.isArray(features.boardColumns)) {
      // Merge with defaults to include any new system columns
      const mergedColumns = mergeWithDefaults(features.boardColumns)
      return NextResponse.json({ columns: mergedColumns })
    }

    // Return default columns if no config found
    return NextResponse.json({ columns: DEFAULT_BOARD_COLUMNS })

  } catch (error) {
    console.error("Error fetching board column config:", error)
    return NextResponse.json({ error: "Failed to fetch board column configuration" }, { status: 500 })
  }
}

// PATCH - Update board column configuration
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true }
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const body = await request.json()
    const { columns } = body

    if (!columns || !Array.isArray(columns)) {
      return NextResponse.json({ error: "Invalid columns data" }, { status: 400 })
    }

    // Get current features
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { features: true }
    })

    const currentFeatures = (org?.features as Record<string, any>) || {}

    // Update features with new boardColumns
    await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        features: {
          ...currentFeatures,
          boardColumns: columns
        }
      }
    })

    return NextResponse.json({ success: true, columns })

  } catch (error) {
    console.error("Error saving board column config:", error)
    return NextResponse.json({ error: "Failed to save board column configuration" }, { status: 500 })
  }
}
