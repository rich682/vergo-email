import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TaskType } from "@prisma/client"
import { TableSchema, TableTaskService } from "@/lib/services/table-task.service"

interface DatasetSignoff {
  signedOffAt: string
  signedOffBy: string
  signedOffByEmail: string
  signedOffByName?: string
}

interface VerificationProgress {
  totalRows: number
  verifiedRows: number
  percentComplete: number
  statusColumn?: string
}

/**
 * GET /api/task-instances/[id]/table/signoff
 * Get current sign-off status and verification progress
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const { id: taskInstanceId } = await params

    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { lineage: true }
    })

    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    if (instance.type !== TaskType.TABLE) {
      return NextResponse.json(
        { error: "This task is not a Database/Table task" },
        { status: 400 }
      )
    }

    const schema = instance.lineage?.config as any as TableSchema | null
    const labels = (instance.labels as any) || {}
    const rows = (instance.structuredData as any[]) || []

    // Get current sign-off status
    const datasetSignoff: DatasetSignoff | null = labels.datasetSignoff || null

    // Calculate verification progress
    let verificationProgress: VerificationProgress | null = null
    
    // Find status column (EDITABLE_COLLAB with type 'status')
    const statusColumn = schema?.columns.find(
      c => c.type === 'status' && c.editPolicy === 'EDITABLE_COLLAB'
    )

    if (statusColumn && rows.length > 0) {
      const verifiedRows = rows.filter(r => r[statusColumn.id] === 'VERIFIED').length
      verificationProgress = {
        totalRows: rows.length,
        verifiedRows,
        percentComplete: Math.round((verifiedRows / rows.length) * 100),
        statusColumn: statusColumn.id
      }
    }

    // Get completion rule from schema
    const completionRule = schema?.completionRule || 'NO_REQUIREMENT'

    // Determine if completion is allowed
    let canComplete = true
    let completionBlockedReason: string | null = null

    if (completionRule === 'DATASET_SIGNOFF' && !datasetSignoff) {
      canComplete = false
      completionBlockedReason = 'Dataset sign-off required before completion'
    } else if (completionRule === 'ALL_ROWS_VERIFIED' && verificationProgress) {
      if (verificationProgress.verifiedRows < verificationProgress.totalRows) {
        canComplete = false
        completionBlockedReason = `All rows must be verified (${verificationProgress.verifiedRows}/${verificationProgress.totalRows} verified)`
      }
    }

    return NextResponse.json({
      taskInstanceId: instance.id,
      isSnapshot: instance.isSnapshot,
      completionRule,
      datasetSignoff,
      verificationProgress,
      canComplete,
      completionBlockedReason
    })
  } catch (error: any) {
    console.error("Error fetching sign-off status:", error)
    return NextResponse.json(
      { error: "Failed to fetch sign-off status", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/task-instances/[id]/table/signoff
 * Sign off on the dataset (mark as verified at dataset level)
 */
export async function POST(
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
    const userName = session.user.name || undefined
    const { id: taskInstanceId } = await params

    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId },
      include: { lineage: true }
    })

    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    if (instance.type !== TaskType.TABLE) {
      return NextResponse.json(
        { error: "This task is not a Database/Table task" },
        { status: 400 }
      )
    }

    // Cannot sign off on snapshots
    if (instance.isSnapshot) {
      return NextResponse.json(
        { error: "Cannot sign off on a historical snapshot" },
        { status: 403 }
      )
    }

    const currentLabels = (instance.labels as any) || {}

    // Create sign-off record
    const datasetSignoff: DatasetSignoff = {
      signedOffAt: new Date().toISOString(),
      signedOffBy: userId,
      signedOffByEmail: userEmail,
      signedOffByName: userName
    }

    // Update labels with sign-off
    await prisma.taskInstance.update({
      where: { id: taskInstanceId },
      data: {
        labels: {
          ...currentLabels,
          datasetSignoff
        }
      }
    })

    return NextResponse.json({
      success: true,
      datasetSignoff
    })
  } catch (error: any) {
    console.error("Error signing off dataset:", error)
    return NextResponse.json(
      { error: "Failed to sign off dataset", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/task-instances/[id]/table/signoff
 * Remove sign-off (allow for corrections)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userRole = (session.user as any).role || 'MEMBER'
    const { id: taskInstanceId } = await params

    // Only admins can remove sign-off
    if (userRole !== 'ADMIN') {
      return NextResponse.json(
        { error: "Only admins can remove sign-off" },
        { status: 403 }
      )
    }

    const instance = await prisma.taskInstance.findFirst({
      where: { id: taskInstanceId, organizationId }
    })

    if (!instance) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 })
    }

    if (instance.isSnapshot) {
      return NextResponse.json(
        { error: "Cannot modify a historical snapshot" },
        { status: 403 }
      )
    }

    const currentLabels = (instance.labels as any) || {}
    const { datasetSignoff, ...restLabels } = currentLabels

    await prisma.taskInstance.update({
      where: { id: taskInstanceId },
      data: {
        labels: restLabels
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error removing sign-off:", error)
    return NextResponse.json(
      { error: "Failed to remove sign-off", message: error.message },
      { status: 500 }
    )
  }
}
