/**
 * Organization User API Endpoint
 *
 * GET /api/org/users/[id] - Get user details (admin-only)
 * PATCH /api/org/users/[id] - Update user (role, name) (admin-only)
 * DELETE /api/org/users/[id] - Remove user from organization (admin-only)
 *
 * Authorization: Admin only
 *
 * Note: Per-user moduleAccess has been removed. Permissions are now purely
 * role-based, configured via Settings > Role Permissions.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { UserRole } from "@prisma/client"

/**
 * GET /api/org/users/[id] - Get user details
 * Admin-only endpoint
 */
export async function GET(
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
    const userRole = session.user.role

    // Admin-only check
    if (userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    const { id: targetUserId } = await params

    const user = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId
      },
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

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.passwordHash && user.passwordHash.length > 10 ? "active" : "pending",
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      }
    })

  } catch (error: any) {
    console.error("Get org user error:", error)
    return NextResponse.json(
      { error: "Failed to get user" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/org/users/[id] - Update user (role, name)
 * Admin-only endpoint
 *
 * Permissions are now purely role-based. Per-user moduleAccess is no longer supported.
 * Configure role permissions in Settings > Role Permissions.
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
    const userRole = session.user.role

    // Admin-only check
    if (userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    const { id: targetUserId } = await params
    const body = await request.json()
    const { role: newRole, name } = body

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

    // Build update data
    const updateData: { role?: UserRole; name?: string } = {}

    // Handle role update
    if (newRole !== undefined) {
      const validRoles = [UserRole.ADMIN, UserRole.MEMBER, UserRole.MANAGER]
      if (!validRoles.includes(newRole)) {
        return NextResponse.json(
          { error: "Valid role is required (ADMIN, MANAGER, or MEMBER)" },
          { status: 400 }
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

      updateData.role = newRole
    }

    // Handle name update
    if (name !== undefined) {
      updateData.name = name.trim() || null
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      )
    }

    // Update the user
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
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
      { error: "Failed to update user" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/org/users/[id] - Remove user from organization
 * Admin-only endpoint
 */
export async function DELETE(
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
    const userRole = session.user.role

    // Admin-only check
    if (userRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    const { id: targetUserId } = await params

    // Prevent deleting yourself
    if (targetUserId === currentUserId) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      )
    }

    // Find the target user
    const targetUser = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId
      }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Delete the user
    await prisma.user.delete({
      where: { id: targetUserId }
    })

    return NextResponse.json({
      success: true,
      message: "User removed from organization"
    })

  } catch (error: any) {
    console.error("Delete org user error:", error)
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    )
  }
}
