import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getJobAccessFilter } from "@/lib/permissions"

export const dynamic = "force-dynamic"

/**
 * GET /api/form-requests/list
 * List individual form requests (one per recipient) for the unified Requests page.
 *
 * Role-Based Access:
 * - Uses same job access filter as /api/requests (inbox:view_all)
 * - ADMIN: Sees all form requests
 * - MEMBER/VIEWER: Only sees form requests from jobs they own or collaborate on
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

    const { searchParams } = new URL(request.url)
    const boardId = searchParams.get("boardId")
    const jobId = searchParams.get("jobId")
    const ownerId = searchParams.get("ownerId")
    const status = searchParams.get("status") // PENDING | SUBMITTED | EXPIRED
    const contactSearch = searchParams.get("contactSearch")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")

    // Use same access filter as /api/requests for consistency
    const jobAccessFilter = getJobAccessFilter(userId, userRole, "inbox:view_all", session.user.orgActionPermissions)

    const where: any = {
      organizationId,
    }

    // Role-based access filter on taskInstance
    if (jobAccessFilter) {
      where.taskInstance = jobAccessFilter
    }

    if (boardId) {
      where.taskInstance = {
        ...where.taskInstance,
        boardId,
      }
    }

    if (jobId) {
      where.taskInstanceId = jobId
    }

    if (ownerId) {
      where.taskInstance = {
        ...where.taskInstance,
        ownerId,
      }
    }

    if (status) {
      where.status = status
    }

    if (dateFrom) {
      where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) }
    }
    if (dateTo) {
      // Add 1 day to include the end date fully
      const endDate = new Date(dateTo)
      endDate.setDate(endDate.getDate() + 1)
      where.createdAt = { ...where.createdAt, lt: endDate }
    }

    const formRequests = await prisma.formRequest.findMany({
      where,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        deadlineDate: true,
        createdAt: true,
        updatedAt: true,
        taskInstanceId: true,
        formDefinitionId: true,
        recipientEntityId: true,
        recipientUserId: true,
        remindersEnabled: true,
        remindersSent: true,
        remindersMaxCount: true,
        formDefinition: {
          select: {
            id: true,
            name: true,
          },
        },
        recipientEntity: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
          },
        },
        recipientUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        taskInstance: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            boardId: true,
            board: {
              select: {
                id: true,
                name: true,
              },
            },
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            taskInstanceLabels: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        _count: {
          select: {
            attachments: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Client-side contact search filter (same pattern as /api/requests)
    let filtered = formRequests
    if (contactSearch) {
      const searchLower = contactSearch.toLowerCase()
      filtered = filtered.filter((fr) => {
        if (fr.recipientEntity) {
          const name = `${fr.recipientEntity.firstName || ""} ${fr.recipientEntity.lastName || ""}`.toLowerCase()
          const email = (fr.recipientEntity.email || "").toLowerCase()
          return name.includes(searchLower) || email.includes(searchLower)
        }
        if (fr.recipientUser) {
          const name = (fr.recipientUser.name || "").toLowerCase()
          const email = (fr.recipientUser.email || "").toLowerCase()
          return name.includes(searchLower) || email.includes(searchLower)
        }
        return false
      })
    }

    return NextResponse.json({
      success: true,
      formRequests: filtered,
      total: filtered.length,
    })
  } catch (error: any) {
    console.error("Error fetching form requests list:", error)
    return NextResponse.json(
      { error: "Failed to fetch form requests" },
      { status: 500 }
    )
  }
}
