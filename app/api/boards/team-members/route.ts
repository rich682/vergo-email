/**
 * Board Team Members API
 * 
 * GET /api/boards/team-members - List team members for board assignment
 * 
 * Returns minimal user info for owner/collaborator selection.
 * Available to all authenticated users (not admin-only).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = session.user.organizationId
    const currentUserId = session.user.id

    // Fetch all active users in the organization
    const users = await prisma.user.findMany({
      where: { 
        organizationId,
        // Only include users who have completed registration (have a password)
        NOT: { passwordHash: "" }
      },
      select: {
        id: true,
        email: true,
        name: true
      },
      orderBy: [
        { name: "asc" },
        { email: "asc" }
      ]
    })

    return NextResponse.json({
      members: users,
      currentUserId
    })
  } catch (error: any) {
    console.error("[API/boards/team-members] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 }
    )
  }
}
