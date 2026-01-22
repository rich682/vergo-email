/**
 * Dataset Snapshots API Routes
 * 
 * POST /api/datasets/[id]/snapshots - Create a new snapshot
 * GET /api/datasets/[id]/snapshots - List all snapshots
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DatasetService } from "@/lib/services/dataset.service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { rows, periodLabel, periodStart, periodEnd, sourceFilename } = body

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Missing required field: rows (array)" },
        { status: 400 }
      )
    }

    const snapshot = await DatasetService.createSnapshot(
      params.id,
      session.user.organizationId,
      session.user.id,
      rows,
      periodLabel,
      periodStart ? new Date(periodStart) : undefined,
      periodEnd ? new Date(periodEnd) : undefined,
      sourceFilename
    )

    return NextResponse.json({ snapshot }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating dataset snapshot:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create snapshot" },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const snapshots = await DatasetService.listSnapshots(
      params.id,
      session.user.organizationId
    )

    return NextResponse.json({ snapshots })
  } catch (error: any) {
    console.error("Error listing dataset snapshots:", error)
    return NextResponse.json(
      { error: error.message || "Failed to list snapshots" },
      { status: 500 }
    )
  }
}
