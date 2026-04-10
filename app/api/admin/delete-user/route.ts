/**
 * DELETE /api/admin/delete-user
 * Admin endpoint to delete a user by email.
 * If the user is the last in the org, the org is NOT auto-deleted —
 * org deletion requires explicit confirmation via a separate step.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userRole = session.user.role
    if (userRole?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email")

    if (!email) {
      return NextResponse.json({ error: "Email parameter required" }, { status: 400 })
    }

    // Find the user - only within the admin's own organization
    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        organizationId: session.user.organizationId,
      },
      include: {
        organization: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Prevent admins from deleting themselves
    if (user.id === session.user.id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
    }

    console.log(`[Admin] Deleting user: ${user.email} (org: ${user.organization?.name}) by admin: ${session.user.email}`)

    // Delete the user (cascade will handle related records based on schema)
    await prisma.user.delete({
      where: { id: user.id },
    })

    // Check if org has any remaining users
    const remainingUsers = await prisma.user.count({
      where: { organizationId: user.organizationId },
    })

    // Warn but do NOT auto-delete the org — too destructive
    if (remainingUsers === 0) {
      console.warn(`[Admin] WARNING: Organization "${user.organization?.name}" (${user.organizationId}) has no remaining users. Manual deletion required if intended.`)
    }

    return NextResponse.json({
      success: true,
      message: `User ${email} deleted successfully`,
      remainingUsers,
      warning: remainingUsers === 0
        ? `Organization "${user.organization?.name}" has no remaining users. Contact support to delete the organization if intended.`
        : undefined,
    })
  } catch (error) {
    console.error("[Admin] Delete user error:", error)
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    )
  }
}
