import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { put } from "@vercel/blob"
import { RECONCILIATION_LIMITS, RECONCILIATION_MESSAGES } from "@/lib/constants/reconciliation"

export const dynamic = "force-dynamic"

/**
 * GET /api/task-instances/[id]/reconciliations - List all reconciliations for a job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const jobId = params.id

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const reconciliations = await prisma.reconciliation.findMany({
      where: { taskInstanceId: jobId, organizationId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    return NextResponse.json({ reconciliations })
  } catch (error: any) {
    console.error("[API/jobs/[id]/reconciliations] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch reconciliations", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/task-instances/[id]/reconciliations - Create a new reconciliation
 * Expects multipart form data with exactly 2 files: document1 and document2
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
    const jobId = params.id

    // Verify job belongs to organization
    const job = await prisma.taskInstance.findFirst({
      where: { id: jobId, organizationId }
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Parse multipart form data
    const formData = await request.formData()
    const document1 = formData.get("document1") as File | null
    const document2 = formData.get("document2") as File | null

    if (!document1 || !document2) {
      return NextResponse.json(
        { error: "Exactly 2 documents are required" },
        { status: 400 }
      )
    }

    // Validate file types (Excel or CSV)
    const allowedTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/csv"
    ]

    const isValidType = (file: File) => {
      // Check MIME type or file extension
      if (allowedTypes.includes(file.type)) return true
      const ext = file.name.split(".").pop()?.toLowerCase()
      return ["xls", "xlsx", "csv"].includes(ext || "")
    }

    if (!isValidType(document1) || !isValidType(document2)) {
      return NextResponse.json(
        { error: RECONCILIATION_MESSAGES.INVALID_FILE_TYPE },
        { status: 400 }
      )
    }

    // Validate file sizes
    if (document1.size > RECONCILIATION_LIMITS.MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Document 1: ${RECONCILIATION_MESSAGES.FILE_TOO_LARGE}` },
        { status: 413 }
      )
    }

    if (document2.size > RECONCILIATION_LIMITS.MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Document 2: ${RECONCILIATION_MESSAGES.FILE_TOO_LARGE}` },
        { status: 413 }
      )
    }

    // Upload documents to blob storage
    const timestamp = Date.now()
    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9.-]/g, "_")

    const [blob1, blob2] = await Promise.all([
      put(
        `reconciliations/${organizationId}/${jobId}/${timestamp}_doc1_${sanitize(document1.name)}`,
        document1,
        { access: "public" }
      ),
      put(
        `reconciliations/${organizationId}/${jobId}/${timestamp}_doc2_${sanitize(document2.name)}`,
        document2,
        { access: "public" }
      )
    ])

    // Create reconciliation record
    const reconciliation = await prisma.reconciliation.create({
      data: {
        organizationId,
        taskInstanceId: jobId,
        document1Key: blob1.url,
        document1Name: document1.name,
        document1Url: blob1.url,
        document1Size: document1.size,
        document2Key: blob2.url,
        document2Name: document2.name,
        document2Url: blob2.url,
        document2Size: document2.size,
        status: "PENDING",
        createdById: userId
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    })

    return NextResponse.json({ reconciliation }, { status: 201 })
  } catch (error: any) {
    console.error("[API/jobs/[id]/reconciliations] Error creating:", error)
    return NextResponse.json(
      { error: "Failed to create reconciliation", message: error.message },
      { status: 500 }
    )
  }
}
