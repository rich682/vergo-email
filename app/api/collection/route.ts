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

    const where: any = {
      organizationId
    }

    if (source && ["EMAIL_REPLY", "MANUAL_UPLOAD"].includes(source)) {
      where.source = source
    }

    if (jobId) {
      where.jobId = jobId
    }

    const items = await prisma.collectedItem.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            name: true,
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
        }
      },
      orderBy: { receivedAt: "desc" }
    })

    // Get total count
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

    return NextResponse.json({
      success: true,
      items,
      total,
      jobs
    })
  } catch (error: any) {
    console.error("Error fetching collection items:", error)
    return NextResponse.json(
      { error: "Failed to fetch collection items", message: error.message },
      { status: 500 }
    )
  }
}
