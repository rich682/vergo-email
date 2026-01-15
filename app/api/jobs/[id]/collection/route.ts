import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CollectionService } from "@/lib/services/collection.service"
import { CollectedItemStatus, CollectedItemSource } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/jobs/[id]/collection
 * List all collected items for a job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id

    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Parse query params for filters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") as CollectedItemStatus | null
    const taskId = searchParams.get("taskId")
    const source = searchParams.get("source") as CollectedItemSource | null

    const filters: {
      status?: CollectedItemStatus
      taskId?: string
      source?: CollectedItemSource
    } = {}

    if (status && ["UNREVIEWED", "APPROVED", "REJECTED"].includes(status)) {
      filters.status = status
    }
    if (taskId) {
      filters.taskId = taskId
    }
    if (source && ["EMAIL_REPLY", "MANUAL_UPLOAD"].includes(source)) {
      filters.source = source
    }

    const items = await CollectionService.getByJobId(jobId, organizationId, filters)
    const approvalStatus = await CollectionService.checkJobApprovalStatus(jobId, organizationId)

    return NextResponse.json({
      success: true,
      items,
      summary: approvalStatus
    })
  } catch (error: any) {
    console.error("Error fetching collection items:", error)
    return NextResponse.json(
      { error: "Failed to fetch collection items", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/jobs/[id]/collection
 * Upload a new file to the collection (manual upload)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userEmail = session.user.email || ""
    const jobId = params.id

    // Verify job exists and belongs to organization
    const job = await prisma.job.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const taskId = formData.get("taskId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Create collected item
    const item = await CollectionService.createFromUpload({
      organizationId,
      jobId,
      taskId: taskId || undefined,
      file: buffer,
      filename: file.name,
      mimeType: file.type || undefined,
      uploadedByUserId: userId,
      uploadedByEmail: userEmail
    })

    return NextResponse.json({
      success: true,
      item
    })
  } catch (error: any) {
    console.error("Error uploading collection item:", error)
    return NextResponse.json(
      { error: "Failed to upload file", message: error.message },
      { status: 500 }
    )
  }
}
