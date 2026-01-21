import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Default column configuration
const DEFAULT_COLUMNS = [
  { id: "name", type: "text", label: "Task", width: 280, visible: true, order: 0, field: "name", isSystem: true },
  { id: "type", type: "taskType", label: "Type", width: 100, visible: true, order: 1, field: "type", isSystem: true },
  { id: "status", type: "status", label: "Status", width: 130, visible: true, order: 2, field: "status", isSystem: true },
  { id: "owner", type: "person", label: "Owner", width: 100, visible: true, order: 3, field: "ownerId", isSystem: true },
  { id: "dueDate", type: "date", label: "Due Date", width: 120, visible: true, order: 4, field: "dueDate", isSystem: true },
  { id: "responses", type: "responses", label: "Responses", width: 100, visible: true, order: 5, field: "responses", isSystem: true },
  { id: "notes", type: "notes", label: "Notes", width: 180, visible: true, order: 6, field: "notes", isSystem: false },
  { id: "files", type: "files", label: "Files", width: 100, visible: true, order: 7, field: "collectedItemCount", isSystem: false },
]

// Merge saved config with default columns to include any new system columns
function mergeWithDefaults(savedColumns: any[]): any[] {
  const savedIds = new Set(savedColumns.map(c => c.id))
  const maxOrder = Math.max(...savedColumns.map(c => c.order), -1)
  
  // Find any default system columns that are missing from saved config
  const missingColumns = DEFAULT_COLUMNS.filter(
    dc => dc.isSystem && !savedIds.has(dc.id)
  ).map((col, index) => ({
    ...col,
    order: maxOrder + 1 + index // Add at the end
  }))
  
  return [...savedColumns, ...missingColumns]
}

// GET - Fetch column configuration for the organization
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

    const searchParams = request.nextUrl.searchParams
    const boardId = searchParams.get("boardId")

    // Try to find board-specific config first, then org-wide config
    let config = null
    
    if (boardId) {
      config = await prisma.jobColumnConfig.findFirst({
        where: {
          organizationId: user.organizationId,
          boardId: boardId
        }
      })
    }
    
    // Fall back to org-wide config if no board-specific config
    if (!config) {
      config = await prisma.jobColumnConfig.findFirst({
        where: {
          organizationId: user.organizationId,
          boardId: null
        }
      })
    }

    if (config) {
      // Merge with defaults to include any new system columns
      const mergedColumns = mergeWithDefaults(config.columns as any[])
      return NextResponse.json({ columns: mergedColumns })
    }

    // Return default columns if no config found
    return NextResponse.json({ columns: DEFAULT_COLUMNS })

  } catch (error) {
    console.error("Error fetching column config:", error)
    return NextResponse.json({ error: "Failed to fetch column configuration" }, { status: 500 })
  }
}

// PATCH - Update column configuration
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
    const { columns, boardId } = body

    if (!columns || !Array.isArray(columns)) {
      return NextResponse.json({ error: "Invalid columns data" }, { status: 400 })
    }

    // Upsert the column configuration
    const config = await prisma.jobColumnConfig.upsert({
      where: {
        organizationId_boardId: {
          organizationId: user.organizationId,
          boardId: boardId || null
        }
      },
      update: {
        columns: columns,
        updatedAt: new Date()
      },
      create: {
        organizationId: user.organizationId,
        boardId: boardId || null,
        columns: columns
      }
    })

    return NextResponse.json({ success: true, config })

  } catch (error) {
    console.error("Error saving column config:", error)
    return NextResponse.json({ error: "Failed to save column configuration" }, { status: 500 })
  }
}
