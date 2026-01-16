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

    // Parse query params for filters and pagination
    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get("boardId")
    const source = searchParams.get("source") as CollectedItemSource | null
    const jobId = searchParams.get("jobId")
    const fileType = searchParams.get("fileType") // "pdf", "image", "spreadsheet", "all"
    const ownerId = searchParams.get("ownerId")
    const submitter = searchParams.get("submitter")
    
    // Pagination params
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100) // Max 100
    const skip = (page - 1) * limit

    const where: any = {
      organizationId
    }

    // Filter by board (via job.boardId)
    if (boardId) {
      where.job = {
        ...where.job,
        boardId
      }
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

    // Get total count for pagination (with filters)
    const filteredCount = await prisma.collectedItem.count({ where })

    let items = await prisma.collectedItem.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            boardId: true,
            board: {
              select: {
                id: true,
                name: true
              }
            },
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
      orderBy: { receivedAt: "desc" },
      skip,
      take: limit
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

    return NextResponse.json({
      success: true,
      items,
      total,
      filteredTotal: ownerId ? items.length : filteredCount,
      page,
      limit,
      totalPages: Math.ceil((ownerId ? items.length : filteredCount) / limit),
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
