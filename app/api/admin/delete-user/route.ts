/**
 * DELETE /api/admin/delete-user
 * Admin endpoint to delete a user by email
 * WARNING: This is a destructive operation - use with caution
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Support both GET and DELETE for easier access
export async function GET(request: NextRequest) {
  return handleDelete(request)
}

export async function DELETE(request: NextRequest) {
  return handleDelete(request)
}

async function handleDelete(request: NextRequest) {
  try {
    // Check for admin secret or authentication
    const { searchParams } = new URL(request.url)
    const adminSecret = searchParams.get("secret")
    
    // Allow with secret OR with valid session
    if (adminSecret !== "vergo-admin-2026") {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized - provide secret parameter" }, { status: 401 })
      }
    }
    const email = searchParams.get("email")

    if (!email) {
      return NextResponse.json({ error: "Email parameter required" }, { status: 400 })
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        organization: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    console.log(`[Admin] Deleting user: ${user.email} (org: ${user.organization?.name})`)

    // Delete the user (cascade will handle related records based on schema)
    await prisma.user.delete({
      where: { id: user.id }
    })

    // Check if org has any remaining users
    const remainingUsers = await prisma.user.count({
      where: { organizationId: user.organizationId }
    })

    // If no users left, delete the organization too
    if (remainingUsers === 0) {
      console.log(`[Admin] No users remaining, deleting organization: ${user.organization?.name}`)
      await prisma.organization.delete({
        where: { id: user.organizationId }
      })
    }

    return NextResponse.json({
      success: true,
      message: `User ${email} deleted successfully`,
      organizationDeleted: remainingUsers === 0
    })

  } catch (error: any) {
    console.error("[Admin] Delete user error:", error)
    return NextResponse.json(
      { error: "Failed to delete user", details: error.message },
      { status: 500 }
    )
  }
}
