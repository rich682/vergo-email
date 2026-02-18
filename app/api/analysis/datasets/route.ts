/**
 * Analysis Datasets API
 *
 * GET  — List all datasets for the org
 * POST — Upload a new dataset (CSV/Excel)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"
import { processDatasetUpload } from "@/lib/analysis/upload-pipeline"

export const maxDuration = 60

const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"]
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:view", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const datasets = await prisma.analysisDataset.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      tableName: true,
      originalFilename: true,
      fileSizeBytes: true,
      status: true,
      rowCount: true,
      columnCount: true,
      createdAt: true,
      uploadedBy: { select: { name: true, email: true } },
    },
  })

  return NextResponse.json({ datasets })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canPerformAction(session.user.role, "analysis:manage", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const name = formData.get("name") as string
  const description = (formData.get("description") as string) || undefined

  if (!file || !name) {
    return NextResponse.json({ error: "File and name are required" }, { status: 400 })
  }

  // Validate file extension
  const ext = "." + file.name.split(".").pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    )
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await processDatasetUpload({
    fileBuffer: buffer,
    fileName: file.name,
    fileSize: file.size,
    organizationId: session.user.organizationId,
    uploadedById: session.user.id,
    datasetName: name,
    description,
  })

  if (result.status === "failed") {
    return NextResponse.json(
      { error: result.errorMessage || "Upload processing failed" },
      { status: 500 }
    )
  }

  return NextResponse.json(result)
}
