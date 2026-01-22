/**
 * Dataset Template Detail API Routes
 * 
 * GET /api/datasets/[id] - Get a dataset template by ID
 * DELETE /api/datasets/[id] - Archive a dataset template
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DatasetService } from "@/lib/services/dataset.service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const template = await DatasetService.getTemplate(
      params.id,
      session.user.organizationId
    )

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error("Error getting dataset template:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get dataset template" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const template = await DatasetService.archiveTemplate(
      params.id,
      session.user.organizationId
    )

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error("Error archiving dataset template:", error)
    return NextResponse.json(
      { error: error.message || "Failed to archive dataset template" },
      { status: 500 }
    )
  }
}
