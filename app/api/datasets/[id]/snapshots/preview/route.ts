/**
 * Dataset Snapshot Preview API Routes
 * 
 * POST /api/datasets/[id]/snapshots/preview - Preview import (validate, compute diff)
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
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { rows, periodStart, periodEnd } = body

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Missing required field: rows (array)" },
        { status: 400 }
      )
    }

    const result = await DatasetService.previewImport(
      params.id,
      session.user.organizationId,
      rows,
      periodStart ? new Date(periodStart) : undefined,
      periodEnd ? new Date(periodEnd) : undefined
    )

    // Check if result is an error
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json({ preview: result })
  } catch (error: any) {
    console.error("Error previewing dataset import:", error)
    return NextResponse.json(
      { error: error.message || "Failed to preview import" },
      { status: 500 }
    )
  }
}
