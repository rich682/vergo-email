/**
 * Organization Team Members API
 * 
 * GET /api/org/team - List team members in organization
 * 
 * Unlike /api/org/users (admin-only), this endpoint is accessible
 * to all org members for selecting owners/collaborators.
 * Returns minimal user info (id, name, email) without sensitive data.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
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

    // Fetch all users in the organization (minimal info only)
    const users = await prisma.user.findMany({
      where: { organizationId, isDebugUser: false },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      },
      orderBy: [
        // Current user first, then alphabetically by name
        { name: "asc" }
      ]
    })

    // Sort to put current user first
    const sortedUsers = users.sort((a, b) => {
      if (a.id === currentUserId) return -1
      if (b.id === currentUserId) return 1
      return (a.name || a.email).localeCompare(b.name || b.email)
    })

    return NextResponse.json({
      success: true,
      currentUserId,
      teamMembers: sortedUsers.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isCurrentUser: user.id === currentUserId
      }))
    })

  } catch (error: any) {
    console.error("List team members error:", error)
    return NextResponse.json(
      { error: "Failed to list team members" },
      { status: 500 }
    )
  }
}
