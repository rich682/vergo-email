/**
 * GET /api/org/settings - Get organization settings
 * PUT /api/org/settings - Update organization settings
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET - Fetch organization settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organization = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    return NextResponse.json(organization)
  } catch (error: any) {
    console.error("[OrgSettings] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch organization settings" },
      { status: 500 }
    )
  }
}

/**
 * PUT - Update organization settings (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can update organization settings" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 }
      )
    }

    if (name.trim().length > 100) {
      return NextResponse.json(
        { error: "Company name must be 100 characters or less" },
        { status: 400 }
      )
    }

    const updatedOrg = await prisma.organization.update({
      where: { id: session.user.organizationId },
      data: {
        name: name.trim()
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    console.log(`[OrgSettings] Organization ${updatedOrg.id} name updated to "${updatedOrg.name}" by user ${session.user.id}`)

    return NextResponse.json(updatedOrg)
  } catch (error: any) {
    console.error("[OrgSettings] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update organization settings" },
      { status: 500 }
    )
  }
}
