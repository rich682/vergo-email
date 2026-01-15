import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CollectedItemSource } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/collection
 * List all collected items across all jobs for the organization
 * Simplified view - just attachments with task/owner info
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId

    // Parse query params for filters
    const { searchParams } = new URL(request.url)
    const source = searchParams.get("source") as CollectedItemSource | null
    const jobId = searchParams.get("jobId")
    const fileType = searchParams.get("fileType") // "pdf", "image", "spreadsheet", "all"
    const ownerId = searchParams.get("ownerId")
    const submitter = searchParams.get("submitter")

    const where: any = {
      organizationId
    }

    if (source && ["EMAIL_REPLY", "MANUAL_UPLOAD"].includes(source)) {
      where.source = source
    }

    if (jobId) {
      where.jobId = jobId
    }

    // File type filtering
    if (fileType && fileType !== "all") {
      switch (fileType) {
        case "pdf":
          where.mimeType = { contains: "pdf" }
          break
        case "image":
          where.mimeType = { startsWith: "image/" }
          break
        case "spreadsheet":
          where.OR = [
            { mimeType: { contains: "spreadsheet" } },
            { mimeType: { contains: "excel" } },
            { mimeType: { contains: "csv" } },
            { filename: { endsWith: ".xlsx" } },
            { filename: { endsWith: ".xls" } },
            { filename: { endsWith: ".csv" } },
          ]
          break
        case "document":
          where.OR = [
            { mimeType: { contains: "pdf" } },
            { mimeType: { contains: "word" } },
            { mimeType: { contains: "document" } },
            { filename: { endsWith: ".doc" } },
            { filename: { endsWith: ".docx" } },
          ]
          break
      }
    }

    // Submitter filter (search by email)
    if (submitter) {
      where.submittedBy = { contains: submitter, mode: "insensitive" }
    }

    let items = await prisma.collectedItem.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        task: {
          select: {
            id: true,
            campaignName: true,
            entity: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        message: {
          select: {
            id: true,
            isAutoReply: true
          }
        }
      },
      orderBy: { receivedAt: "desc" }
    })

    // Filter by owner if specified (owner is on the job)
    if (ownerId) {
      items = items.filter(item => item.job?.ownerId === ownerId)
    }

    // Get total count (without filters for summary)
    const total = await prisma.collectedItem.count({
      where: { organizationId }
    })

    // Get unique jobs for filter dropdown
    const jobs = await prisma.job.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true
      },
      orderBy: { name: "asc" }
    })

    // Get unique owners for filter dropdown
    const owners = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true
      },
      orderBy: { name: "asc" }
    })

    // Get file type counts for summary
    const pdfCount = await prisma.collectedItem.count({
      where: { organizationId, mimeType: { contains: "pdf" } }
    })

    return NextResponse.json({
      success: true,
      items,
      total,
      pdfCount,
      jobs,
      owners
    })
  } catch (error: any) {
    console.error("Error fetching collection items:", error)
    return NextResponse.json(
      { error: "Failed to fetch collection items", message: error.message },
      { status: 500 }
    )
  }
}
