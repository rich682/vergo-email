/**
 * Organization User API Endpoint
 * 
 * PATCH /api/org/users/[id] - Update user role (admin-only)
 * 
 * Authorization: Admin only
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"

/**
 * PATCH /api/org/users/[id] - Update user role
 * Admin-only endpoint
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const currentUserId = session.user.id
    const userRole = (session.user as any).role as UserRole

    // Admin-only check
    if (userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    const { id: targetUserId } = await params
    const body = await request.json()
    const { role: newRole } = body

    // Validate role
    const validRoles = [UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER]
    if (!newRole || !validRoles.includes(newRole)) {
      return NextResponse.json(
        { error: "Valid role is required (ADMIN, MEMBER, or VIEWER)" },
        { status: 400 }
      )
    }

    // Find the target user
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId  // Ensure user is in same org
      }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Prevent demoting yourself if you're the only admin
    if (targetUserId === currentUserId && newRole !== UserRole.ADMIN) {
      const adminCount = await prisma.user.count({
        where: {
          organizationId,
          role: UserRole.ADMIN
        }
      })

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot demote yourself - you are the only admin" },
          { status: 400 }
        )
      }
    }

    // Update the user's role
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true
      }
    })

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        status: updatedUser.passwordHash && updatedUser.passwordHash.length > 10 ? "active" : "pending",
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString()
      }
    })

  } catch (error: any) {
    console.error("Update org user error:", error)
    return NextResponse.json(
      { error: "Failed to update user", message: error.message },
      { status: 500 }
    )
  }
}
