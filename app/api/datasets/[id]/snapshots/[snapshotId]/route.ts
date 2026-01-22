/**
 * Dataset Snapshot Detail API Routes
 * 
 * GET /api/datasets/[id]/snapshots/[snapshotId] - Get a snapshot by ID
 * DELETE /api/datasets/[id]/snapshots/[snapshotId] - Delete a snapshot
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DatasetService } from "@/lib/services/dataset.service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, snapshotId } = await params

    const snapshot = await DatasetService.getSnapshot(
      snapshotId,
      session.user.organizationId
    )

    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 })
    }

    // Verify snapshot belongs to the template
    if (snapshot.templateId !== id) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 })
    }

    return NextResponse.json({ snapshot })
  } catch (error: unknown) {
    console.error("Error getting dataset snapshot:", error)
    const message = error instanceof Error ? error.message : "Failed to get snapshot"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, snapshotId } = await params

    // Verify snapshot exists and belongs to the template
    const snapshot = await DatasetService.getSnapshot(
      snapshotId,
      session.user.organizationId
    )

    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 })
    }

    if (snapshot.templateId !== id) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 })
    }

    await DatasetService.deleteSnapshot(snapshotId, session.user.organizationId)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting dataset snapshot:", error)
    const message = error instanceof Error ? error.message : "Failed to delete snapshot"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
