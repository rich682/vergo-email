import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CollectedItemSource, CollectedItemStatus } from "@prisma/client"
import { getJobAccessFilter, canPerformAction } from "@/lib/permissions"

export const dynamic = "force-dynamic"

/**
 * GET /api/collection
 * List all collected items across all jobs for the organization
 * Simplified view - just attachments with task/owner info
 * 
 * Role-Based Access:
 * - ADMIN: Sees all collection items
 * - MEMBER/VIEWER: Only sees items from jobs they own or collaborate on
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role as string | undefined

    // Parse query params for filters and pagination
    const { searchParams } = new URL(request.url)
    console.log("[API] GET /api/collection", { boardId: searchParams.get("boardId"), jobId: searchParams.get("jobId") })
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

    // Get job access filter based on user role and action permissions
    const jobAccessFilter = getJobAccessFilter(userId, userRole, "collection:view_all", session.user.orgActionPermissions)

    const where: any = {
      organizationId,
      // Role-based access: only show items from task instances user can access
      ...(jobAccessFilter && { taskInstance: jobAccessFilter })
    }

    // Filter by board (via taskInstance.boardId) - merge with taskInstance filter
    if (boardId) {
      where.taskInstance = {
        ...where.taskInstance,
        boardId
      }
    }

    if (source && ["EMAIL_REPLY", "MANUAL_UPLOAD"].includes(source)) {
      where.source = source
    }

    if (jobId) {
      where.taskInstanceId = jobId
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

    // Parallelize: items + count + total + dropdown queries all at once
    const [filteredCount, items, total, jobs, owners] = await Promise.all([
      // Filtered count for pagination
      prisma.collectedItem.count({ where }),
      // Main items query
      prisma.collectedItem.findMany({
        where,
        include: {
          taskInstance: {
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
          request: {
            select: {
              id: true,
              campaignName: true,
              entity: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  companyName: true
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
      }),
      // Total count (without filters for summary)
      prisma.collectedItem.count({
        where: { organizationId }
      }),
      // Unique jobs for filter dropdown, filtered by access
      prisma.taskInstance.findMany({
        where: {
          organizationId,
          ...(jobAccessFilter || {})
        },
        select: {
          id: true,
          name: true
        },
        orderBy: { name: "asc" }
      }),
      // Unique owners for filter dropdown
      prisma.user.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          email: true
        },
        orderBy: { name: "asc" }
      }),
    ])

    // Filter by owner if specified (owner is on the task instance)
    let filteredItems = items
    if (ownerId) {
      filteredItems = items.filter(item => item.taskInstance?.ownerId === ownerId)
    }

    // Transform items to match frontend interface (taskInstance -> job, request -> task)
    const transformedItems = filteredItems.map(item => ({
      ...item,
      jobId: item.taskInstanceId,
      job: item.taskInstance,
      task: item.request,
    }))

    return NextResponse.json({
      success: true,
      items: transformedItems,
      total,
      filteredTotal: ownerId ? filteredItems.length : filteredCount,
      page,
      limit,
      totalPages: Math.ceil((ownerId ? filteredItems.length : filteredCount) / limit),
      jobs,
      owners
    })
  } catch (error: any) {
    console.error("Error fetching collection items:", error)
    return NextResponse.json(
      { error: "Failed to fetch collection items" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/collection
 * Update a collected item's status (approve/reject)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id

    if (!canPerformAction(session.user.role, "collection:manage", session.user.orgActionPermissions)) {
      return NextResponse.json({ error: "You do not have permission to manage collection items" }, { status: 403 })
    }

    const body = await request.json()
    const { id, status, rejectionReason } = body

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    // Validate status
    const validStatuses: CollectedItemStatus[] = ["UNREVIEWED", "APPROVED", "REJECTED"]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      )
    }

    // Verify item exists and belongs to org
    const existing = await prisma.collectedItem.findFirst({
      where: { id, organizationId }
    })

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // Update item
    const updated = await prisma.collectedItem.update({
      where: { id },
      data: {
        status: status || existing.status,
        reviewedBy: userId,
        reviewedAt: new Date(),
        rejectionReason: status === "REJECTED" ? rejectionReason : null
      }
    })

    return NextResponse.json({
      success: true,
      item: updated
    })
  } catch (error: any) {
    console.error("Error updating collection item:", error)
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    )
  }
}
