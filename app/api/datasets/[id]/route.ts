/**
 * Dataset Template Detail API Routes
 * 
 * GET /api/datasets/[id] - Get a dataset template by ID
 * DELETE /api/datasets/[id] - Delete a dataset template (only if no snapshots)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const organizationId = session.user.organizationId

    const template = await prisma.datasetTemplate.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        _count: {
          select: { snapshots: true },
        },
      },
    })

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error: unknown) {
    console.error("Error getting dataset template:", error)
    const message = error instanceof Error ? error.message : "Failed to get dataset template"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: templateId } = await params
    const organizationId = session.user.organizationId

    // Get template with snapshot count
    const template = await prisma.datasetTemplate.findFirst({
      where: {
        id: templateId,
        organizationId,
      },
      include: {
        _count: {
          select: { snapshots: true },
        },
      },
    })

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    // Only allow delete if no snapshots exist
    if (template._count.snapshots > 0) {
      return NextResponse.json(
        { error: "Cannot delete schema with existing data. Delete all snapshots first." },
        { status: 400 }
      )
    }

    // Delete in a transaction:
    // 1. Clear datasetTemplateId from any TaskLineage referencing this template
    // 2. Delete the template
    await prisma.$transaction(async (tx) => {
      // Clear linkage from TaskLineage
      await tx.taskLineage.updateMany({
        where: {
          datasetTemplateId: templateId,
          organizationId,
        },
        data: {
          datasetTemplateId: null,
        },
      })

      // Delete the template
      await tx.datasetTemplate.delete({
        where: { id: templateId },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error deleting dataset template:", error)
    const message = error instanceof Error ? error.message : "Failed to delete dataset template"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
