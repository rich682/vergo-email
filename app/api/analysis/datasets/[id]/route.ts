/**
 * Analysis Dataset Detail API
 *
 * GET    — Get dataset detail (schema, stats)
 * DELETE — Delete dataset + Parquet blob
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { del } from "@vercel/blob"

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:view", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const dataset = await prisma.analysisDataset.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
    },
    include: {
      uploadedBy: { select: { name: true, email: true } },
    },
  })

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 })
  }

  return NextResponse.json({ dataset })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:manage", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const dataset = await prisma.analysisDataset.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
    },
  })

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 })
  }

  // Delete Parquet blob
  if (dataset.parquetBlobUrl) {
    try {
      await del(dataset.parquetBlobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
    } catch (error) {
      console.warn("[Analysis] Failed to delete blob:", error)
    }
  }

  // Delete Postgres record
  await prisma.analysisDataset.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
