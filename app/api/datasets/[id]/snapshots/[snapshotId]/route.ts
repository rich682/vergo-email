/**
 * Dataset Snapshot Detail API Routes
 * 
 * GET /api/datasets/[id]/snapshots/[snapshotId] - Get a snapshot by ID
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DatasetService } from "@/lib/services/dataset.service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; snapshotId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const snapshot = await DatasetService.getSnapshot(
      params.snapshotId,
      session.user.organizationId
    )

    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 })
    }

    // Verify snapshot belongs to the template
    if (snapshot.templateId !== params.id) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 })
    }

    return NextResponse.json({ snapshot })
  } catch (error: any) {
    console.error("Error getting dataset snapshot:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get snapshot" },
      { status: 500 }
    )
  }
}
