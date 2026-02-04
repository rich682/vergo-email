/**
 * Users API Endpoint
 * 
 * GET /api/users - List all users in the organization
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      where: {
        organizationId: session.user.organizationId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: [
        { name: "asc" },
        { email: "asc" },
      ],
    })

    return NextResponse.json({ users })
  } catch (error: any) {
    console.error("Error fetching users:", error)
    return NextResponse.json(
      { error: "Failed to fetch users", message: error.message },
      { status: 500 }
    )
  }
}
