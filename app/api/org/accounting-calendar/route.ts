import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET /api/org/accounting-calendar - Get accounting calendar settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const org = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { fiscalYearStartMonth: true }
    })

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    return NextResponse.json({
      fiscalYearStartMonth: org.fiscalYearStartMonth
    })
  } catch (error: any) {
    console.error("[API/org/accounting-calendar] Error getting settings:", error)
    return NextResponse.json(
      { error: "Failed to get accounting calendar settings", message: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/org/accounting-calendar - Update accounting calendar settings
 * 
 * Body:
 * - fiscalYearStartMonth: number (1-12)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { fiscalYearStartMonth } = body

    // Validate fiscalYearStartMonth
    if (typeof fiscalYearStartMonth !== "number" || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
      return NextResponse.json(
        { error: "Fiscal year start month must be a number between 1 and 12" },
        { status: 400 }
      )
    }

    const org = await prisma.organization.update({
      where: { id: session.user.organizationId },
      data: { fiscalYearStartMonth },
      select: { fiscalYearStartMonth: true }
    })

    return NextResponse.json({
      fiscalYearStartMonth: org.fiscalYearStartMonth
    })
  } catch (error: any) {
    console.error("[API/org/accounting-calendar] Error updating settings:", error)
    return NextResponse.json(
      { error: "Failed to update accounting calendar settings", message: error.message },
      { status: 500 }
    )
  }
}
