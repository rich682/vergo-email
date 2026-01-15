import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CollectedItemStatus, CollectedItemSource } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/collection
 * List all collected items across all jobs for the organization
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
    const status = searchParams.get("status") as CollectedItemStatus | null
    const source = searchParams.get("source") as CollectedItemSource | null

    const where: any = {
      organizationId
    }

    if (status && ["UNREVIEWED", "APPROVED", "REJECTED"].includes(status)) {
      where.status = status
    }

    if (source && ["EMAIL_REPLY", "MANUAL_UPLOAD"].includes(source)) {
      where.source = source
    }

    const items = await prisma.collectedItem.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            name: true
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
            subject: true,
            createdAt: true
          }
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { receivedAt: "desc" }
    })

    // Calculate summary
    const allItems = await prisma.collectedItem.findMany({
      where: { organizationId },
      select: { status: true }
    })

    const summary = {
      total: allItems.length,
      approved: allItems.filter(i => i.status === "APPROVED").length,
      rejected: allItems.filter(i => i.status === "REJECTED").length,
      unreviewed: allItems.filter(i => i.status === "UNREVIEWED").length
    }

    return NextResponse.json({
      success: true,
      items,
      summary
    })
  } catch (error: any) {
    console.error("Error fetching collection items:", error)
    return NextResponse.json(
      { error: "Failed to fetch collection items", message: error.message },
      { status: 500 }
    )
  }
}
