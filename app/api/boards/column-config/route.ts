import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

// Default column configuration for boards list
const DEFAULT_BOARD_COLUMNS = [
  { id: "name", label: "Item", width: 280, visible: true, order: 0, isSystem: true },
  { id: "cadence", label: "Cadence", width: 100, visible: true, order: 1, isSystem: true },
  { id: "period", label: "Period", width: 140, visible: true, order: 2, isSystem: true },
  { id: "status", label: "Status", width: 120, visible: true, order: 3, isSystem: true },
  { id: "owner", label: "Person", width: 140, visible: true, order: 4, isSystem: true },
  { id: "updatedAt", label: "Date", width: 120, visible: true, order: 5, isSystem: true },
]

// Default column configuration for tasks within expanded board rows
// Matches the columns available in the main jobs table
const DEFAULT_TASK_COLUMNS = [
  { id: "name", label: "Task", width: 280, visible: true, order: 0, isSystem: true },
  { id: "status", label: "Status", width: 130, visible: true, order: 1, isSystem: true },
  { id: "type", label: "Type", width: 120, visible: true, order: 2, isSystem: true },
  { id: "owner", label: "Owner", width: 120, visible: true, order: 3, isSystem: true },
  { id: "dueDate", label: "Target Date", width: 100, visible: true, order: 4, isSystem: true },
  { id: "responses", label: "Responses", width: 100, visible: true, order: 5, isSystem: true },
  { id: "notes", label: "Notes", width: 150, visible: true, order: 6, isSystem: true },
  { id: "files", label: "Files", width: 80, visible: true, order: 7, isSystem: true },
]

// Merge saved config with default columns to include any new system columns
function mergeWithDefaults(savedColumns: any[], defaultColumns: any[]): any[] {
  const savedIds = new Set(savedColumns.map(c => c.id))
  const maxOrder = Math.max(...savedColumns.map(c => c.order), -1)
  
  // Find any default system columns that are missing from saved config
  const missingColumns = defaultColumns.filter(
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
    
    // Get board columns (for board rows)
    let columns = DEFAULT_BOARD_COLUMNS
    if (features.boardColumns && Array.isArray(features.boardColumns)) {
      columns = mergeWithDefaults(features.boardColumns, DEFAULT_BOARD_COLUMNS)
    }

    // Get task columns (for tasks within expanded boards)
    let taskColumns = DEFAULT_TASK_COLUMNS
    if (features.boardTaskColumns && Array.isArray(features.boardTaskColumns)) {
      taskColumns = mergeWithDefaults(features.boardTaskColumns, DEFAULT_TASK_COLUMNS)
    }

    return NextResponse.json({ columns, taskColumns })

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

    if (!canPerformAction(session.user.role, "boards:edit_columns", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to edit board column configuration" }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true }
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    const body = await request.json()
    const { columns, taskColumns } = body

    // Get current features
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { features: true }
    })

    const currentFeatures = (org?.features as Record<string, any>) || {}
    const updatedFeatures = { ...currentFeatures }

    // Update board columns if provided
    if (columns && Array.isArray(columns)) {
      updatedFeatures.boardColumns = columns
    }

    // Update task columns if provided
    if (taskColumns && Array.isArray(taskColumns)) {
      updatedFeatures.boardTaskColumns = taskColumns
    }

    // Save updated features
    await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        features: updatedFeatures
      }
    })

    return NextResponse.json({ 
      success: true, 
      columns: updatedFeatures.boardColumns || DEFAULT_BOARD_COLUMNS,
      taskColumns: updatedFeatures.boardTaskColumns || DEFAULT_TASK_COLUMNS
    })

  } catch (error) {
    console.error("Error saving board column config:", error)
    return NextResponse.json({ error: "Failed to save board column configuration" }, { status: 500 })
  }
}
