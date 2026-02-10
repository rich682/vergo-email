/**
 * User Profile API
 *
 * GET /api/user/profile - Get current user's profile
 * PATCH /api/user/profile - Update current user's profile (name only; email is read-only)
 *
 * Authorization: Any authenticated user (self-service)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/user/profile - Get current user's profile
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        connectedEmailAccounts: {
          where: { isActive: true },
          select: {
            id: true,
            email: true,
            provider: true,
            isPrimary: true,
            isActive: true,
            lastSyncAt: true,
          },
          orderBy: { isPrimary: "desc" },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Split name into first/last for the form
    const nameParts = (user.name || "").trim().split(/\s+/)
    const firstName = nameParts[0] || ""
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""

    return NextResponse.json({
      success: true,
      profile: {
        id: user.id,
        email: user.email,
        firstName,
        lastName,
        name: user.name,
        role: user.role,
        organizationName: user.organization?.name || "",
        createdAt: user.createdAt.toISOString(),
        connectedEmailAccounts: user.connectedEmailAccounts,
      },
    })
  } catch (error: any) {
    console.error("[UserProfile] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get profile" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/user/profile - Update current user's profile
 * Users can update their own name. Email changes are not allowed (security).
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName } = body

    // Build full name from first + last
    const fullName = [
      (firstName || "").trim(),
      (lastName || "").trim(),
    ]
      .filter(Boolean)
      .join(" ")

    if (!fullName) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { name: fullName },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })

    return NextResponse.json({
      success: true,
      profile: updatedUser,
    })
  } catch (error: any) {
    console.error("[UserProfile] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    )
  }
}
