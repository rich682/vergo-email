import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TableTaskService, TableSchema } from "@/lib/services/table-task.service"
import { TaskInstanceService } from "@/lib/services/task-instance.service"
import { TaskType } from "@prisma/client"

/**
 * PATCH /api/task-instances/[id]/table/cell
 * Update a single cell in the collaboration plane
 * Enforces row-level access control - user must own the row or be admin
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userEmail = session.user.email
    const userRole = (session.user as any).role || 'MEMBER'
    const { id: taskInstanceId } = await params
    const body = await request.json()

    const { identityValue, columnId, value } = body

    // Validate required fields
    if (identityValue === undefined || identityValue === null) {
      return NextResponse.json(
        { error: "identityValue is required" },
        { status: 400 }
      )
    }

    if (!columnId) {
      return NextResponse.json(
        { error: "columnId is required" },
        { status: 400 }
      )
    }

    // Verify instance exists and is TABLE type
    const instance = await TaskInstanceService.findById(taskInstanceId, organizationId)
    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    if (instance.type !== TaskType.TABLE) {
      return NextResponse.json(
        { error: "This task is not a Database/Table task" },
        { status: 400 }
      )
    }

    // Check immutability (Invariant: Snapshot instances are read-only)
    if (instance.isSnapshot) {
      return NextResponse.json(
        { error: "Cannot modify a historical snapshot" },
        { status: 403 }
      )
    }

    // Check row-level access control
    const fullInstance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { lineage: true }
    })

    if (fullInstance?.lineage?.config) {
      const schema = fullInstance.lineage.config as any as TableSchema
      
      if (schema.rowOwnerColumn && schema.rowAccessMode && schema.rowAccessMode !== 'ALL') {
        const rows = (fullInstance.structuredData as any[]) || []
        const row = rows.find(r => r[schema.identityKey] === identityValue)
        
        if (row && !TableTaskService.canUserAccessRow(row, schema, userEmail, userRole)) {
          return NextResponse.json(
            { error: "You do not have permission to modify this row" },
            { status: 403 }
          )
        }
      }
    }

    // Perform cell update (service validates column edit policy)
    try {
      await TableTaskService.updateCollaborationCell(
        taskInstanceId,
        organizationId,
        identityValue,
        columnId,
        value
      )
    } catch (err: any) {
      // Return appropriate error for policy violations
      if (err.message.includes("not editable")) {
        return NextResponse.json(
          { error: "This column is read-only and cannot be edited" },
          { status: 403 }
        )
      }
      if (err.message.includes("Row not found")) {
        return NextResponse.json(
          { error: "Row not found with the specified identity value" },
          { status: 404 }
        )
      }
      throw err
    }

    return NextResponse.json({
      success: true,
      identityValue,
      columnId,
      value,
    })
  } catch (error: any) {
    console.error("Cell update error:", error)
    return NextResponse.json(
      { error: "Failed to update cell", message: error.message },
      { status: 500 }
    )
  }
}
